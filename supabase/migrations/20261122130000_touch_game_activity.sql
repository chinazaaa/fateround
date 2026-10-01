-- Make real gameplay bump `games.last_activity_at`.
--
-- The problem: `last_activity_at` is read everywhere as "is this game alive?"
-- (src/lib/idle-reaper.ts closes `active` games idle for 30 minutes;
-- src/lib/game-tick.ts bounds ticker discovery by it), but it was only ever
-- written by
--   * the BEFORE UPDATE trigger on `games` (any write to the games row),
--   * the AFTER INSERT/DELETE trigger on `players` (joins / leaves), and
--   * three host/lobby routes.
-- Turn-based gameplay never touches the `games` row at all — ludo, monopoly,
-- chess, whot, scrabble, mahjong, checkers, yahtzee, crazy-eights,
-- snake-and-ladder etc. write only their `*_sessions` / board sub-tables, and a
-- message-inbox game only ever inserts into `anonymous_messages`. A four-player
-- ludo game an hour into play therefore looks *completely idle*, and the reaper
-- would close it mid-move (destructively so for `secret_message`, whose finish
-- path deletes the whole inbox).
--
-- The fix must not become the traffic it is trying to save: this exists to cut
-- Supabase egress, so one write per move is unacceptable. Hence a throttled,
-- single-statement bump — an UPDATE guarded by its own staleness predicate, so
-- the "should we write?" decision is made server-side inside the one round trip
-- and a move within the throttle window costs an UPDATE that matches zero rows.
-- The caller (src/lib/game-activity.ts) additionally remembers the last bump
-- per game in-process, so the common case is no round trip at all.
--
-- Interaction with the existing BEFORE UPDATE trigger `games_touch_last_activity`
-- (20261001120000): that trigger fires only WHEN `old.last_activity_at is not
-- distinct from new.last_activity_at`. This statement always sets the column to
-- a strictly newer value, so the trigger does not fire and cannot overwrite it —
-- and the value we write is `now()` anyway, which is what the trigger would set.
--
-- Indexes: the predicate `id = p_game_id` uses the games primary key, so this
-- never scans. `games_active_idle_idx` / `games_waiting_idle_idx` are untouched
-- and keep serving the reaper's "oldest idle games" scan; the only cost is the
-- index maintenance of moving a row within them, bounded by the throttle to at
-- most one per game per window.

create or replace function touch_game_activity(p_game_id text, p_throttle_minutes integer default 5)
returns boolean
language plpgsql
as $$
declare
  v_updated integer;
begin
  if p_game_id is null then
    return false;
  end if;

  -- Single guarded statement, no preceding read. `greatest(..., 0)` keeps a
  -- nonsense/negative throttle from turning this into an unconditional write.
  update games
  set last_activity_at = now()
  where id = p_game_id
    and status in ('waiting', 'active')
    and last_activity_at < now() - make_interval(mins => greatest(coalesce(p_throttle_minutes, 5), 0));

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- Reached only through the service-role client from server routes
-- (src/lib/game-admin.ts assertPlayer). Nothing anon-facing needs to call it,
-- and letting anon call it would let anyone keep an abandoned game off the
-- reaper's list, so drop the default PUBLIC execute grant.
revoke execute on function touch_game_activity(text, integer) from public;
revoke execute on function touch_game_activity(text, integer) from anon;
revoke execute on function touch_game_activity(text, integer) from authenticated;
