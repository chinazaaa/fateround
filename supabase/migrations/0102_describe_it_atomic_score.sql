-- Text Charades (individual mode): record a correct guess AND credit its points in a
-- single atomic call, instead of an INSERT followed by a separate score RPC.
--
-- The old two-step had a gap: if the process died between inserting the scored guess
-- row and incrementing the player's score, the point was lost forever — the partial
-- unique index (idx_describe_it_guesses_scored_unique) then blocked any retry from
-- re-scoring. Folding both into one function closes that gap and stays idempotent:
-- a re-submit hits ON CONFLICT, inserts nothing, scores nothing, and returns false.
CREATE OR REPLACE FUNCTION describe_it_record_correct_guess(
  p_game_id text,
  p_turn_index integer,
  p_player_id uuid,
  p_text text,
  p_points integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer;
BEGIN
  -- Conflict target matches the partial unique index (game_id, turn_index, player_id)
  -- WHERE correct AND points > 0, so a second scored guess for this player/turn no-ops.
  INSERT INTO describe_it_guesses (game_id, turn_index, player_id, team, text, correct, points)
  VALUES (p_game_id, p_turn_index, p_player_id, 0, p_text, true, p_points)
  ON CONFLICT (game_id, turn_index, player_id) WHERE correct AND points > 0
  DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false; -- already scored this turn — no double-award
  END IF;

  UPDATE describe_it_players
  SET score = score + p_points
  WHERE game_id = p_game_id AND player_id = p_player_id;

  RETURN true;
END;
$$;
