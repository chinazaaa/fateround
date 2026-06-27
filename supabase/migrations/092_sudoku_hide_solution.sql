-- Keep the Sudoku solution out of client-readable data.
--
-- Previously the full solution lived in rounds.sudoku_metadata, which players load
-- directly — so a player could read every answer from the network/devtools and
-- instantly solve all blocks. Move the solution into its own table that anon can
-- write once (at round creation) but never SELECT, and route every legitimate
-- solution access through SECURITY DEFINER functions so no caller ever receives the
-- answers for blocks they haven't earned.

CREATE TABLE IF NOT EXISTS sudoku_solutions (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  solution jsonb NOT NULL
);

ALTER TABLE sudoku_solutions ENABLE ROW LEVEL SECURITY;

-- Anon may INSERT the solution once (the start route writes it right after creating
-- the round). There are deliberately NO select/update/delete policies, so PostgREST
-- denies all reads — the solution is only ever read inside the definer functions
-- below. A second insert for the same round hits the PK and is rejected, so a player
-- can't overwrite a solution they don't know.
DROP POLICY IF EXISTS "sudoku_solutions_insert" ON sudoku_solutions;
CREATE POLICY "sudoku_solutions_insert" ON sudoku_solutions FOR INSERT WITH CHECK (true);

-- Backfill in-flight games, then strip the solution from the client-readable metadata.
INSERT INTO sudoku_solutions (round_id, solution)
SELECT id, sudoku_metadata->'solution'
FROM rounds
WHERE sudoku_metadata ? 'solution'
ON CONFLICT (round_id) DO NOTHING;

UPDATE rounds
SET sudoku_metadata = sudoku_metadata - 'solution'
WHERE sudoku_metadata ? 'solution';

-- ── Block submission (validate + score + record), solution never leaves the DB ──
-- Validates a player's 3×3 block against the hidden solution, scores it by solve
-- order, records the submission, and reports whether the whole puzzle is now solved.
-- Returns only the verdict — never the solution.
CREATE OR REPLACE FUNCTION sudoku_submit_block(
  p_game_id text,
  p_player_id uuid,
  p_block_index integer,
  p_cells jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status   text;
  v_round_id uuid;
  v_solution jsonb;
  v_br       int := (p_block_index / 3) * 3;
  v_bc       int := (p_block_index % 3) * 3;
  v_r        int;
  v_c        int;
  v_correct  boolean := true;
  v_points   int;
  v_prior    int;
  v_solved   int;
BEGIN
  IF p_block_index < 0 OR p_block_index > 8 THEN
    RAISE EXCEPTION 'INVALID_BLOCK';
  END IF;

  SELECT status INTO v_status FROM games WHERE id = p_game_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'GAME_NOT_FOUND'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'GAME_NOT_ACTIVE'; END IF;

  SELECT id INTO v_round_id FROM rounds WHERE game_id = p_game_id AND round_number = 1;
  IF v_round_id IS NULL THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;

  -- Already solved this block correctly? (wrong answers may be retried)
  IF EXISTS (
    SELECT 1 FROM sudoku_submissions
    WHERE round_id = v_round_id AND player_id = p_player_id
      AND block_index = p_block_index AND is_correct
  ) THEN
    RAISE EXCEPTION 'ALREADY_SOLVED';
  END IF;

  SELECT solution INTO v_solution FROM sudoku_solutions WHERE round_id = v_round_id;
  IF v_solution IS NULL THEN RAISE EXCEPTION 'SOLUTION_MISSING'; END IF;

  -- Validate the 3×3 block against the solution. OR short-circuits, so a missing
  -- cell trips v_correct=false without attempting an int cast on NULL.
  FOR v_r IN 0..2 LOOP
    FOR v_c IN 0..2 LOOP
      IF (p_cells->v_r->>v_c) IS NULL
         OR (p_cells->v_r->>v_c)::int <> (v_solution->(v_br + v_r)->>(v_bc + v_c))::int THEN
        v_correct := false;
      END IF;
    END LOOP;
  END LOOP;

  IF v_correct THEN
    -- Points by solve order: 1st=10, 2nd=6, 3rd=3, 4th+=1
    SELECT count(*) INTO v_prior FROM sudoku_submissions
    WHERE round_id = v_round_id AND block_index = p_block_index AND is_correct;
    v_points := (ARRAY[10, 6, 3, 1])[LEAST(v_prior, 3) + 1];
  ELSE
    v_points := -3;
  END IF;

  BEGIN
    INSERT INTO sudoku_submissions (game_id, round_id, player_id, block_index, is_correct, points_awarded)
    VALUES (p_game_id, v_round_id, p_player_id, p_block_index, v_correct, v_points);
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent correct submission won the partial unique index first.
    RAISE EXCEPTION 'ALREADY_SOLVED';
  END;

  SELECT count(DISTINCT block_index) INTO v_solved
  FROM sudoku_submissions WHERE round_id = v_round_id AND is_correct;

  RETURN jsonb_build_object(
    'is_correct', v_correct,
    'points_awarded', v_points,
    'all_solved', v_solved >= 9
  );
END;
$$;

-- ── Refresh reconstruction: solution cells for THIS player's solved blocks only ──
-- Returns a 9×9 grid of the solution values for blocks the player has already solved
-- correctly, and 0 everywhere else. Safe to reveal — these blocks are done.
CREATE OR REPLACE FUNCTION sudoku_solved_cells(
  p_round_id uuid,
  p_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solution jsonb;
  v_grid     int[];
  v_block    int;
  v_br       int;
  v_bc       int;
  v_r        int;
  v_c        int;
BEGIN
  SELECT solution INTO v_solution FROM sudoku_solutions WHERE round_id = p_round_id;
  IF v_solution IS NULL THEN RETURN '[]'::jsonb; END IF;

  v_grid := array_fill(0, ARRAY[9, 9]); -- 9×9 of zeros (1-indexed)

  FOR v_block IN
    SELECT DISTINCT block_index FROM sudoku_submissions
    WHERE round_id = p_round_id AND player_id = p_player_id AND is_correct
  LOOP
    v_br := (v_block / 3) * 3;
    v_bc := (v_block % 3) * 3;
    FOR v_r IN 0..2 LOOP
      FOR v_c IN 0..2 LOOP
        v_grid[v_br + v_r + 1][v_bc + v_c + 1] := (v_solution->(v_br + v_r)->>(v_bc + v_c))::int;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN to_jsonb(v_grid);
END;
$$;

-- ── Host solution: full grid, gated on the host token ──
-- The host legitimately shows the solution (spectator view). Requires the secret
-- host token, so only the host can call it.
CREATE OR REPLACE FUNCTION sudoku_host_solution(
  p_game_id text,
  p_host_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token    text;
  v_solution jsonb;
BEGIN
  SELECT host_token INTO v_token FROM games WHERE id = p_game_id;
  IF v_token IS NULL OR v_token <> p_host_token THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT s.solution INTO v_solution
  FROM rounds r
  JOIN sudoku_solutions s ON s.round_id = r.id
  WHERE r.game_id = p_game_id AND r.round_number = 1;

  RETURN coalesce(v_solution, 'null'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION sudoku_submit_block(text, uuid, integer, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sudoku_solved_cells(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sudoku_host_solution(text, text) TO anon, authenticated;
