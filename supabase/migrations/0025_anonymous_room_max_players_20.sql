-- Cap anonymous room lobby size at 20 (was 50).
UPDATE games SET max_players = 20 WHERE max_players > 20;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_players_check;
ALTER TABLE games ADD CONSTRAINT games_max_players_check
  CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 20);

ALTER TABLE games ALTER COLUMN max_players SET DEFAULT 20;
