-- Track how many completed sessions (play-again cycles) each game code has seen.
-- The admin dashboard uses this to report "total sessions played" accurately:
-- a game replayed 10 times is 10 sessions, not 1 game.

alter table games add column if not exists sessions_played integer not null default 1;

-- Backfill from game_snapshots where available.
-- Each snapshot = one completed session before the current one.
update games
set sessions_played = sub.cnt + 1
from (
  select game_id, count(*) as cnt
  from game_snapshots
  group by game_id
) sub
where games.id = sub.game_id;

-- Admin-only column: the service role reads it for the dashboard.
-- No anon/authenticated grant needed — it is NOT in GAME_SELECT.
