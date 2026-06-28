-- Trivia and Two Truths support up to 40 players; bingo/codewords still clamp in app code.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_players_check;
ALTER TABLE games ADD CONSTRAINT games_max_players_check
  CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 40);
