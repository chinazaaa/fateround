-- Monopoly player board token (car, hat, dog, etc.) chosen at join.
ALTER TABLE players ADD COLUMN IF NOT EXISTS monopoly_token text;

CREATE UNIQUE INDEX IF NOT EXISTS players_game_monopoly_token_unique
  ON players (game_id, monopoly_token)
  WHERE monopoly_token IS NOT NULL;
