ALTER TABLE games ADD COLUMN IF NOT EXISTS codewords_player_picks boolean NOT NULL DEFAULT true;
