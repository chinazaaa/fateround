-- Atomic finish-rank assignment for Matching Pairs.
-- Prevents duplicate ranks under concurrent finishers by using a single
-- PG function (instead of SELECT-count + separate UPDATE which races).

CREATE OR REPLACE FUNCTION matching_pairs_finish_player(
  p_round_id uuid,
  p_player_id uuid,
  p_pairs_matched integer,
  p_wrong_attempts integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rank integer;
  v_finished boolean;
BEGIN
  -- Check if already finished (compare-and-swap).
  SELECT finished INTO v_finished
  FROM memory_match_progress
  WHERE round_id = p_round_id AND player_id = p_player_id;

  IF v_finished THEN
    RETURN jsonb_build_object('error', 'ALREADY_FINISHED');
  END IF;

  -- Atomically assign rank: count existing finishers and add 1.
  SELECT COALESCE(MAX(finish_rank), 0) + 1 INTO v_rank
  FROM memory_match_progress
  WHERE round_id = p_round_id AND finished = true;

  UPDATE memory_match_progress
  SET finished = true,
      finish_rank = v_rank,
      finished_at = now(),
      updated_at = now(),
      pairs_matched = p_pairs_matched,
      wrong_attempts = p_wrong_attempts
  WHERE round_id = p_round_id
    AND player_id = p_player_id
    AND NOT finished;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ROW_MISSING');
  END IF;

  RETURN jsonb_build_object('finish_rank', v_rank);
END;
$$;

REVOKE EXECUTE ON FUNCTION matching_pairs_finish_player(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
