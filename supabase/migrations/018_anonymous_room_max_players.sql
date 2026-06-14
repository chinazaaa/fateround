ALTER TABLE games ADD COLUMN IF NOT EXISTS max_players integer CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 15);
