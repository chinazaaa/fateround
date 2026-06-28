-- App allows anonymous room caps up to 50; migration 018 capped at 15.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_players_check;
ALTER TABLE games ADD CONSTRAINT games_max_players_check
  CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 50);
