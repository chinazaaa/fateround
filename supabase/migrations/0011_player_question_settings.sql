ALTER TABLE games ADD COLUMN IF NOT EXISTS player_questions_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE games ADD COLUMN IF NOT EXISTS player_questions_order text NOT NULL DEFAULT 'players_first'
  CHECK (player_questions_order IN ('players_first', 'uploaded_first', 'mixed'));
