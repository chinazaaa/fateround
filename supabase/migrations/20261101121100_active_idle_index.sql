-- Index for the in-process idle-active-game reaper (src/lib/idle-reaper.ts).
--
-- The Phase A stale-lobby cron closes `status='waiting'` games idle for 15
-- minutes with a pure SQL update. Active games can't take that path — the
-- finish machinery (room-game points, round-facts snapshot, tournament
-- resolution) lives in the TypeScript `markGameFinished` / `adminEndGame`
-- path — so a Node-side reaper does the sweep instead. This index makes
-- the reaper's "active games idle longer than N hours" scan cheap even
-- once we have thousands of active rows.
create index if not exists games_active_idle_idx
  on games (last_activity_at)
  where status = 'active';
