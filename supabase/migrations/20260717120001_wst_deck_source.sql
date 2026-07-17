-- Who Said This: add a 'deck' quote source for the Pre-set roster mode (host-provided
-- quote+answer deck from Platform / Library / an uploaded CSV). The deck itself is stored
-- in games.custom_questions (same as trivia/crossword pools); this only widens the source
-- enum so the game knows to build choice-rounds from that deck rather than player-submitted
-- or auto-fetched anime quotes.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_wst_quote_source_check;
ALTER TABLE games
  ADD CONSTRAINT games_wst_quote_source_check
  CHECK (wst_quote_source IN ('player', 'anime', 'both', 'deck'));
