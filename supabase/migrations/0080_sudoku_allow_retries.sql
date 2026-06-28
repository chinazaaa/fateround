-- Allow multiple attempts per player per block (wrong answers no longer lock out)
-- Keep the unique constraint only on correct submissions via a partial unique index.
ALTER TABLE sudoku_submissions
  DROP CONSTRAINT IF EXISTS sudoku_submissions_player_id_round_id_block_index_key;

CREATE UNIQUE INDEX IF NOT EXISTS sudoku_submissions_correct_unique
  ON sudoku_submissions (player_id, round_id, block_index)
  WHERE is_correct = true;
