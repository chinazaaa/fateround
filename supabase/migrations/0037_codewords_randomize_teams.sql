ALTER TABLE games
  ADD COLUMN IF NOT EXISTS codewords_randomize_teams boolean NOT NULL DEFAULT false;
