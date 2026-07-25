-- Mafia: the skip-phase endpoint previously read skip_requested_player_ids, appended the
-- caller's id in application code, and wrote the whole array back — a classic
-- read-modify-write race. Two players tapping Skip at the same moment could read the same
-- array, so one append silently vanished (majority never reached), or worse: both
-- independently computed "majority reached" from their own stale view and both called
-- runMafiaAdvance, which (each doing its own fresh phase read) could advance the game two
-- phases in one round-trip instead of one.
--
-- array_append inside a single UPDATE statement is atomic under Postgres row-level locking —
-- concurrent callers serialize automatically, no application-level retry loop needed.
CREATE OR REPLACE FUNCTION mafia_append_skip_request(p_game_id text, p_phase text, p_player_id uuid)
RETURNS text[]
LANGUAGE sql
AS $$
  UPDATE mafia_sessions
  SET skip_requested_player_ids = array_append(skip_requested_player_ids, p_player_id::text)
  WHERE game_id = p_game_id
    AND phase = p_phase
    AND NOT (p_player_id::text = ANY(skip_requested_player_ids))
  RETURNING skip_requested_player_ids;
$$;

GRANT EXECUTE ON FUNCTION mafia_append_skip_request(text, text, uuid) TO service_role;
