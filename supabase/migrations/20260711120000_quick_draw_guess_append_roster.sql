-- Atomically append an individual-mode late joiner to a Quick Draw guess
-- session's drawer-rotation roster.
--
-- The previous approach read the roster, appended in JS, and wrote it back — a
-- read-modify-write race: two players late-joining at the same time both read
-- the same snapshot and the last write wins, dropping one from the roster (and
-- from drawer rotation). This does it in a single row-locked UPDATE: the
-- `NOT (... = ANY(roster))` guard is re-evaluated under Postgres's
-- EvalPlanQual after a concurrent writer commits, so simultaneous joins append
-- both players and a duplicate join is a no-op. Skips finished sessions.
CREATE OR REPLACE FUNCTION quick_draw_guess_append_roster(
  p_game_id text,
  p_player_id text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE quick_draw_guess_sessions
  SET roster = roster || p_player_id,
      updated_at = now()
  WHERE game_id = p_game_id
    AND status <> 'finished'
    AND NOT (p_player_id = ANY(roster));
END;
$$;
