-- Switch Sudoku from 3×3 block submissions to per-cell competitive play.
-- Players submit individual cells; the first correct solver claims each cell.

ALTER TABLE sudoku_submissions
  ADD COLUMN IF NOT EXISTS cell_row integer CHECK (cell_row IS NULL OR (cell_row >= 0 AND cell_row <= 8)),
  ADD COLUMN IF NOT EXISTS cell_col integer CHECK (cell_col IS NULL OR (cell_col >= 0 AND cell_col <= 8)),
  ADD COLUMN IF NOT EXISTS submitted_value integer CHECK (submitted_value IS NULL OR (submitted_value >= 1 AND submitted_value <= 9));

ALTER TABLE sudoku_submissions ALTER COLUMN block_index DROP NOT NULL;

DROP INDEX IF EXISTS sudoku_submissions_correct_unique;

-- Retire the old sudoku_submit_block RPC and remove its EXECUTE grant.
REVOKE EXECUTE ON FUNCTION sudoku_submit_block(text, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS sudoku_submit_block(text, uuid, integer, jsonb);

-- Only one correct claim per cell per round (first solver wins the cell).
CREATE UNIQUE INDEX IF NOT EXISTS sudoku_submissions_cell_claimed_unique
  ON sudoku_submissions (round_id, cell_row, cell_col)
  WHERE is_correct = true AND cell_row IS NOT NULL AND cell_col IS NOT NULL;

-- Each player may correctly solve a given cell at most once.
CREATE UNIQUE INDEX IF NOT EXISTS sudoku_submissions_player_cell_correct_unique
  ON sudoku_submissions (player_id, round_id, cell_row, cell_col)
  WHERE is_correct = true AND cell_row IS NOT NULL AND cell_col IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sudoku_submissions_cell
  ON sudoku_submissions (round_id, cell_row, cell_col)
  WHERE cell_row IS NOT NULL AND cell_col IS NOT NULL;

-- ── Cell submission (validate + score + record) ─────────────────────────────
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
  v_claimed   int;
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

  -- Cell already claimed by anyone?
  IF EXISTS (
    SELECT 1 FROM sudoku_submissions
    WHERE round_id = v_round_id AND cell_row = p_row AND cell_col = p_col AND is_correct
  ) THEN
    RAISE EXCEPTION 'CELL_ALREADY_CLAIMED';
  END IF;

  -- Player already solved this cell correctly?
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

  IF v_correct THEN
    v_points := 10;
  ELSE
    v_points := -3;
  END IF;

  INSERT INTO sudoku_submissions (
    game_id, round_id, player_id, block_index, cell_row, cell_col, submitted_value, is_correct, points_awarded
  ) VALUES (
    p_game_id, v_round_id, p_player_id, NULL, p_row, p_col, p_value, v_correct, v_points
  );

  SELECT count(*) INTO v_claimed FROM sudoku_submissions
  WHERE round_id = v_round_id AND is_correct AND cell_row IS NOT NULL;

  SELECT count(*) INTO v_empty
  FROM generate_series(0, 8) AS r,
       generate_series(0, 8) AS c
  WHERE coalesce((v_puzzle->r->>c)::int, 0) = 0;

  RETURN jsonb_build_object(
    'is_correct', v_correct,
    'points_awarded', v_points,
    'all_solved', v_claimed >= v_empty
  );
END;
$$;

-- ── Refresh reconstruction: all claimed cells on the board ────────────────────
CREATE OR REPLACE FUNCTION sudoku_claimed_cells(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solution jsonb;
  v_grid     int[];
  v_rec      record;
BEGIN
  SELECT solution INTO v_solution FROM sudoku_solutions WHERE round_id = p_round_id;
  IF v_solution IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_grid := array_fill(0, ARRAY[9, 9]);

  FOR v_rec IN
    SELECT DISTINCT ON (cell_row, cell_col) cell_row, cell_col
    FROM sudoku_submissions
    WHERE round_id = p_round_id AND is_correct AND cell_row IS NOT NULL
    ORDER BY cell_row, cell_col, submitted_at ASC
  LOOP
    v_grid[v_rec.cell_row + 1][v_rec.cell_col + 1] :=
      (v_solution->v_rec.cell_row->>v_rec.cell_col)::int;
  END LOOP;

  RETURN to_jsonb(v_grid);
END;
$$;

REVOKE EXECUTE ON FUNCTION sudoku_submit_cell(text, uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sudoku_claimed_cells(uuid) TO anon, authenticated;
