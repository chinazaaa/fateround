-- Discovery Phase C — scheduled games + RSVPs.
--
-- Adds:
--   1. games.scheduled_at (nullable) — when a game is set to open. A row with
--      status='scheduled' waits here; at T-0 the pg_cron tick flips it to
--      status='waiting' and Phase A's normal lobby flow takes over.
--   2. games.opened_at (nullable) — stamped when a scheduled game transitions
--      to 'waiting'. Used by the unconfirmed-RSVP drop (10 min after open).
--   3. game_rsvps — one row per (device × scheduled game). confirmed_at flips
--      when the user taps "I'm ready" post-open. reminder_sent_at guards the
--      T-15 push so it only fires once per RSVP.
--   4. pg_cron ticks every minute, calling scheduled_games_tick() — a plpgsql
--      function that does the pure-SQL work (transition, unconfirmed-drop) and
--      then uses pg_net to POST /api/scheduled/tick so the Node side can send
--      the T-15 and T-0 pushes via the existing Expo/web-push senders. The
--      HTTP handoff is guarded by CRON_SECRET; when pg_net or pg_cron isn't
--      available in this environment the migration is a no-op and the scan
--      can be triggered manually by hitting the endpoint.
--
-- Load-bearing invariants (§ plan):
--   - RSVP is intent, not seating. No player row until "I'm ready".
--   - Un-RSVP is silent (deletes row, no push).
--   - Cancel + reschedule + transfer-to-new-host bypass quiet hours.
--   - Start is DISABLED on scheduled games; the only path to earlier opening
--     is Reschedule → Now, which fires the standard reschedule push.

alter table games add column if not exists scheduled_at timestamptz;
alter table games add column if not exists opened_at timestamptz;

create index if not exists games_scheduled_open_idx
  on games (scheduled_at)
  where status = 'scheduled';

create index if not exists games_waiting_open_idx
  on games (opened_at)
  where status = 'waiting' and opened_at is not null;

create table if not exists public.game_rsvps (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references public.games(id) on delete cascade,
  -- Device identity from Phase B. Reuses notification_subscriber_devices.id so
  -- a device that RSVPs on scheduled game X automatically inherits the same
  -- push token + quiet-hours we already know about.
  device_id uuid not null references public.notification_subscriber_devices(id) on delete cascade,
  rsvped_at timestamptz not null default now(),
  -- Flips when the user taps "I'm ready" in the post-open lobby. Null until
  -- then; server auto-clears the whole row 10 min post-opened_at if still null.
  confirmed_at timestamptz,
  -- Set when the T-15min reminder push lands — guards a re-fire on a later
  -- tick or a reschedule that keeps the same anchor. Cleared on reschedule.
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (game_id, device_id)
);

create index if not exists game_rsvps_game_idx on public.game_rsvps (game_id);
create index if not exists game_rsvps_device_idx on public.game_rsvps (device_id);

-- Only server routes touch these tables — RLS enabled with no public
-- policies, matching the Phase B tables.
alter table public.game_rsvps enable row level security;

-- Helper: convert a game_id + display_name pair from a resume_token to a
-- device_id via notification_subscriber_devices. Referenced by API routes.
-- (The endpoints instead accept the tokenKey directly and look it up server-
-- side, so no SQL helper is strictly required. Left blank.)

-- Auto-drop unconfirmed RSVPs 10 minutes after lobby-open. Idempotent — the
-- next tick re-runs the same delete.
create or replace function drop_stale_unconfirmed_rsvps() returns int
language plpgsql as $$
declare
  n int;
begin
  with dropped as (
    delete from game_rsvps r
    using games g
    where r.game_id = g.id
      and g.status = 'waiting'
      and g.opened_at is not null
      and g.opened_at < now() - interval '10 minutes'
      and r.confirmed_at is null
    returning r.id
  )
  select count(*) into n from dropped;
  return n;
end
$$;

-- Auto-transition scheduled → waiting when scheduled_at hits. Stamps
-- opened_at so the drop-unconfirmed job has an anchor.
create or replace function open_scheduled_games_due() returns int
language plpgsql as $$
declare
  n int;
begin
  with opened as (
    update games
    set status = 'waiting',
        opened_at = now(),
        last_activity_at = now()
    where status = 'scheduled'
      and scheduled_at is not null
      and scheduled_at <= now()
    returning id
  )
  select count(*) into n from opened;
  return n;
end
$$;

-- Register both jobs + the notification-tick HTTP fan-out. pg_cron and pg_net
-- are available on Supabase but may not be enabled on every self-hosted env.
-- The whole block is guarded so a missing extension turns the whole scheduler
-- into a no-op instead of a migration failure.
do $$
declare
  api_base text;
  cron_secret text;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    return;
  end if;
  create extension if not exists pg_cron;

  -- Pure-SQL jobs (no HTTP needed). Every minute.
  perform cron.unschedule(jobid) from cron.job where jobname = 'open_scheduled_games_due';
  perform cron.schedule(
    'open_scheduled_games_due',
    '* * * * *',
    $sql$ select open_scheduled_games_due(); $sql$
  );

  perform cron.unschedule(jobid) from cron.job where jobname = 'drop_stale_unconfirmed_rsvps';
  perform cron.schedule(
    'drop_stale_unconfirmed_rsvps',
    '*/2 * * * *',
    $sql$ select drop_stale_unconfirmed_rsvps(); $sql$
  );

  -- Push fan-out tick. Requires pg_net + two GUCs the operator sets once via
  --   alter database <db> set app.api_base = 'https://fateround.com';
  --   alter database <db> set app.cron_secret = '<same as CRON_SECRET env>';
  -- Skips cleanly when either is missing OR pg_net isn't available.
  if not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return;
  end if;
  create extension if not exists pg_net;

  begin
    api_base := current_setting('app.api_base', true);
    cron_secret := current_setting('app.cron_secret', true);
  exception when others then
    api_base := null;
    cron_secret := null;
  end;

  if api_base is null or api_base = '' or cron_secret is null or cron_secret = '' then
    return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'scheduled_games_push_tick';
  perform cron.schedule(
    'scheduled_games_push_tick',
    '* * * * *',
    format(
      $sql$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L)
      ); $sql$,
      api_base || '/api/scheduled/tick',
      'Bearer ' || cron_secret
    )
  );
end
$$;
