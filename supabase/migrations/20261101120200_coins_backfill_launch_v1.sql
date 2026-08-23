-- Coins & Shop — one-shot retro backfill for every profile that exists on
-- launch day. Set-based, not row-by-row: one CTE-driven UPDATE + INSERT so
-- the whole thing runs in a single transaction with a single planner pass
-- rather than emitting six PL/pgSQL statements per profile.
--
-- Idempotent by design: the `pending` CTE anti-joins against coin_ledger
-- for reason='launch_grant_v1', so re-running this migration silently
-- skips anyone already granted. No `on conflict do nothing` on the
-- insert — that would let the `update profiles` bump the balance
-- without a matching ledger row on a conflict, breaking the "ledger is
-- truth" invariant. Migrations run serially, nothing else is racing;
-- the partial unique index on the ledger remains a hard safety net.
--
-- Formula per plan §"Backfill methodology":
--   raw = 5*trophies
--       + 3*min(daily_challenges, 100)
--       + 25*tournaments_placed  -- handle-matched, blank handles excluded
--       + 1*min(games_finished, 500)
--       + 100 flat welcome
--   capped at 2000
--
-- Anyone who signs up AFTER this migration ran gets only the 100-coin
-- welcome grant via grant_welcome() — the plan's timing rule (no gaming
-- the launch date).

with pending as (
  select
    p.id as profile_id,
    -- Per-profile aggregates via correlated subqueries. Each one is a
    -- single index lookup; the planner won't multiply row counts.
    (select count(*)::bigint from player_trophies t where t.profile_id = p.id)                          as trophies,
    least((select count(*)::bigint from daily_scores d where d.profile_id = p.id), 100)                 as dailies,
    -- Tournaments key on player_name, not profile_id, so this is a handle
    -- match. Blank-handle profiles are excluded to keep them from
    -- picking up every unnamed placement (see grant_launch_v1 for the
    -- same guard on the per-profile path).
    coalesce((
      select count(*)::bigint
        from tournament_players tp
       where coalesce(p.handle, '') <> ''
         and lower(tp.player_name) = lower(p.handle)
         and not tp.is_eliminated
    ), 0)                                                                                                as tournaments,
    least(coalesce((
      select ps.games_played
        from player_stats ps
       where ps.profile_id = p.id and ps.game_type = '__global__'
    ), 0), 500)                                                                                          as games_finished
  from profiles p
  where not exists (
    select 1 from coin_ledger cl
     where cl.profile_id = p.id and cl.reason = 'launch_grant_v1'
  )
),
scored as (
  select
    profile_id,
    least(
      5 * trophies + 3 * dailies + 25 * tournaments + 1 * games_finished + 100,
      2000
    )::bigint as grant_coins,
    trophies, dailies, tournaments, games_finished
  from pending
),
applied as (
  update profiles p
     set coins = p.coins + s.grant_coins
    from scored s
   where p.id = s.profile_id
     and s.grant_coins > 0
  returning
    p.id            as profile_id,
    p.coins         as balance_after,
    s.grant_coins,
    s.trophies, s.dailies, s.tournaments, s.games_finished
)
insert into coin_ledger
  (profile_id, delta, balance_after, reason, ref_id, admin_note)
select
  a.profile_id,
  a.grant_coins,
  a.balance_after,
  'launch_grant_v1',
  'launch_grant_v1',
  jsonb_build_object(
    'trophies', a.trophies,
    'daily_challenges', a.dailies,
    'tournaments_placed', a.tournaments,
    'games_finished', a.games_finished,
    'welcome_flat', 100,
    'granted', a.grant_coins,
    'capped_at', 2000
  )::text
from applied a;
