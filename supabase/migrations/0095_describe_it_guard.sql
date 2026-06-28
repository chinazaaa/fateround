-- Belt-and-suspenders for Describe It scoring: a given word can be scored at
-- most once per turn, so two simultaneous correct guesses can't double-count it.
-- The app layer also guards this with a conditional update; this is the DB-level
-- backstop. Partial index on guessed rows only (skipped rows are unconstrained).
CREATE UNIQUE INDEX IF NOT EXISTS idx_describe_it_words_guessed_unique
  ON describe_it_words (game_id, turn_index, word)
  WHERE status = 'guessed';
