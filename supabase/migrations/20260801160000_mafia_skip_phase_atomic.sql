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
--
-- skip_requested_player_ids is uuid[] (see 20260801150000) — compare/append p_player_id as
-- uuid directly, no ::text cast (ANY() over a uuid[] yields uuid, so a text cast produces
-- "operator does not exist: text = uuid").
CREATE OR REPLACE FUNCTION mafia_append_skip_request(p_game_id text, p_phase text, p_player_id uuid)
RETURNS uuid[]
LANGUAGE sql
AS $$
  UPDATE mafia_sessions
  SET skip_requested_player_ids = array_append(skip_requested_player_ids, p_player_id)
  WHERE game_id = p_game_id
    AND phase = p_phase
    AND NOT (p_player_id = ANY(skip_requested_player_ids))
  RETURNING skip_requested_player_ids;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on a new function — without revoking it,
-- anon/authenticated could call this RPC directly via PostgREST, appending arbitrary player
-- ids and bypassing the route's assertPlayer/resumeToken check entirely.
REVOKE EXECUTE ON FUNCTION mafia_append_skip_request(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mafia_append_skip_request(text, text, uuid) TO service_role;
