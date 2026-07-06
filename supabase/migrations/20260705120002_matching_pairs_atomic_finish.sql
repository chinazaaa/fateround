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
  v_rank    integer;
  v_finished boolean;
  v_lock_key bigint;
BEGIN
  -- Serialize rank assignment per round so two concurrent calls for the same
  -- round cannot both read MAX(finish_rank)=0 and both award rank 1.
  v_lock_key := hashtext(COALESCE(p_round_id::text, ''));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check if already finished (compare-and-swap) — inside the lock so the
  -- NOT-finished guard below and the MAX counter share a consistent snapshot.
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

  -- Lock released automatically when the surrounding transaction commits.
  RETURN jsonb_build_object('finish_rank', v_rank);
END;
$$;

REVOKE EXECUTE ON FUNCTION matching_pairs_finish_player(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
