-- Discovery Phase A — stale-lobby auto-close, entirely in-database.
--
-- Rule (see docs/mobile-discovery-plan.md §"Stale-lobby auto-close"):
--   A game with status='waiting' and no state change for 15 minutes
--   transitions to status='finished', result_reason='idle_timeout'. Same rule
--   applies to post-game "Play Again" lobbies (also status='waiting').
--
-- Runs as a pg_cron job every 2 minutes — no external scheduler, no HTTP
-- round-trip. `waiting`-state closes have no rounds, no trophies to snapshot,
-- and no room-game points to award, so a pure SQL update is correct and
-- cheap; the existing TypeScript markGameFinished path stays the finish route
-- for `active` games where round-facts + tournament wiring matter.
--
-- The feed (GET /api/games) already filters on status='waiting' AND
-- max_players >= 2 AND is_public=true, so a stale lobby vanishes from /browse
-- the moment this job runs.

alter table games add column if not exists result_reason text;
alter table games add column if not exists last_activity_at timestamptz not null default now();
-- Dedup: at most 1 "someone joined your game" push per 60s per game, and at
-- most one T-13min idle warning per lobby lifetime (see docs/mobile-discovery-plan).
alter table games add column if not exists last_host_join_push_at timestamptz;
alter table games add column if not exists host_idle_warning_sent_at timestamptz;

create index if not exists games_waiting_idle_idx
  on games (last_activity_at)
  where status = 'waiting';

-- Bump last_activity_at whenever a game row is mutated (settings edits, code
-- rotations, host bookkeeping) so an actively-curated lobby never times out.
-- Skip the bump when the caller already set the column, so a manual
-- backdate for testing still lands.
create or replace function touch_games_last_activity_at()
returns trigger language plpgsql as $$
begin
  new.last_activity_at := now();
  return new;
end
$$;

drop trigger if exists games_touch_last_activity on games;
create trigger games_touch_last_activity
  before update on games
  for each row
  when (old.last_activity_at is not distinct from new.last_activity_at)
  execute function touch_games_last_activity_at();

-- Player joins / leaves also count as activity — a full lobby that lost one
-- player two minutes ago is not idle.
create or replace function touch_game_activity_from_players()
returns trigger language plpgsql as $$
declare
  target_game text;
begin
  target_game := coalesce(new.game_id, old.game_id);
  if target_game is null then
    return coalesce(new, old);
  end if;
  update games set last_activity_at = now() where id = target_game;
  return coalesce(new, old);
end
$$;

drop trigger if exists players_touch_game_activity on players;
create trigger players_touch_game_activity
  after insert or delete on players
  for each row
  execute function touch_game_activity_from_players();

-- The close job itself. Bounded LIMIT so one tick can never lock more than a
-- few hundred rows even on a bad day; the next tick picks up the rest.
create or replace function close_idle_waiting_lobbies(
  threshold_minutes int default 15,
  batch_limit int default 500
)
returns int language plpgsql as $$
declare
  closed_count int;
begin
  with victims as (
    select id
    from games
    where status = 'waiting'
      and last_activity_at < now() - (threshold_minutes || ' minutes')::interval
    order by last_activity_at
    limit batch_limit
    for update skip locked
  )
  update games g
  set status = 'finished',
      finished_at = now(),
      result_reason = 'idle_timeout'
  from victims v
  where g.id = v.id;
  get diagnostics closed_count = row_count;
  return closed_count;
end
$$;

-- Register the scheduler. pg_cron is available on Supabase; wrap in a guarded
-- block so the migration is a no-op on environments where the extension is not
-- available (local dev without the extension enabled, CI containers, etc.) —
-- the SQL function above still works and can be invoked manually.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Unschedule any prior version of this job so re-running the migration
    -- doesn't stack duplicate schedules on the same name.
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'close_idle_waiting_lobbies';
    perform cron.schedule(
      'close_idle_waiting_lobbies',
      '*/2 * * * *',
      $cron$ select close_idle_waiting_lobbies(15); $cron$
    );
  end if;
end
$$;
