-- Per-cell ranked scoring: multiple players may correctly solve the same cell.
-- 1st = 10, 2nd = 6, 3rd = 4, 4th+ = 2. Each player scores a cell at most once.

DROP INDEX IF EXISTS sudoku_submissions_cell_claimed_unique;

CREATE OR REPLACE FUNCTION sudoku_submit_cell(
  p_game_id text,
  p_player_id uuid,
  p_row integer,
  p_col integer,
  p_value integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status    text;
  v_round_id  uuid;
  v_puzzle    jsonb;
  v_solution  jsonb;
  v_given     int;
  v_correct   boolean;
  v_points    int;
  v_prior     int;
  v_solved    int;
  v_empty     int;
BEGIN
  IF p_row < 0 OR p_row > 8 OR p_col < 0 OR p_col > 8 THEN
    RAISE EXCEPTION 'INVALID_CELL';
  END IF;
  IF p_value < 1 OR p_value > 9 THEN
    RAISE EXCEPTION 'INVALID_VALUE';
  END IF;

  SELECT status INTO v_status FROM games WHERE id = p_game_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'GAME_NOT_ACTIVE'; END IF;

  SELECT id, sudoku_metadata->'puzzle' INTO v_round_id, v_puzzle
  FROM rounds WHERE game_id = p_game_id AND round_number = 1;
  IF v_round_id IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;

  v_given := (v_puzzle->p_row->>p_col)::int;
  IF v_given IS NOT NULL AND v_given <> 0 THEN
    RAISE EXCEPTION 'CELL_IS_GIVEN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sudoku_submissions
    WHERE round_id = v_round_id AND player_id = p_player_id
      AND cell_row = p_row AND cell_col = p_col AND is_correct
  ) THEN
    RAISE EXCEPTION 'ALREADY_SOLVED';
  END IF;

  SELECT solution INTO v_solution FROM sudoku_solutions WHERE round_id = v_round_id;
  IF v_solution IS NULL THEN RAISE EXCEPTION 'SOLUTION_MISSING'; END IF;

  v_correct := p_value = (v_solution->p_row->>p_col)::int;

  -- Serialize all submissions for this round to prevent concurrent check/insert races.
  PERFORM pg_advisory_xact_lock(hashtext(v_round_id::text));

  IF v_correct THEN
    -- Serialize ranking for this cell so concurrent first-solvers don't both get 10.
    PERFORM pg_advisory_xact_lock(
      hashtext(v_round_id::text || ':' || p_row::text || ':' || p_col::text)
    );
    SELECT count(*) INTO v_prior FROM sudoku_submissions
    WHERE round_id = v_round_id AND cell_row = p_row AND cell_col = p_col AND is_correct;
    v_points := (ARRAY[10, 6, 4, 2])[LEAST(v_prior, 3) + 1];
  ELSE
    v_points := -3;
  END IF;

  BEGIN
    INSERT INTO sudoku_submissions (
      game_id, round_id, player_id, block_index, cell_row, cell_col, submitted_value, is_correct, points_awarded
    ) VALUES (
      p_game_id, v_round_id, p_player_id, NULL, p_row, p_col, p_value, v_correct, v_points
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_SOLVED';
  END;

  SELECT count(DISTINCT (cell_row, cell_col)) INTO v_solved
  FROM sudoku_submissions
  WHERE round_id = v_round_id AND is_correct AND cell_row IS NOT NULL;

  SELECT count(*) INTO v_empty
  FROM generate_series(0, 8) AS r,
       generate_series(0, 8) AS c
  WHERE coalesce((v_puzzle->r->>c)::int, 0) = 0;

  RETURN jsonb_build_object(
    'is_correct', v_correct,
    'points_awarded', v_points,
    'all_solved', v_solved >= v_empty
  );
END;
$$;
