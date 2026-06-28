-- Bingo supports up to 30 players; anonymous/codewords still clamp in app code.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_players_check;
ALTER TABLE games ADD CONSTRAINT games_max_players_check
  CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 30);
