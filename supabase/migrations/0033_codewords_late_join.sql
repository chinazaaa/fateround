ALTER TABLE games ADD COLUMN IF NOT EXISTS codewords_late_join boolean NOT NULL DEFAULT false;
