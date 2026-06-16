ALTER TABLE games ADD COLUMN IF NOT EXISTS allow_late_players boolean NOT NULL DEFAULT true;

-- Existing games with late join enabled keep player late join on.
UPDATE games SET allow_late_players = allow_viewers WHERE allow_viewers = true;
