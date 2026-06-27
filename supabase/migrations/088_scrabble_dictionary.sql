-- Per-game Scrabble dictionary selection. Each game can choose which word list
-- validates plays; defaults to the standard ENABLE list.
ALTER TABLE games ADD COLUMN IF NOT EXISTS scrabble_dictionary_id text NOT NULL DEFAULT 'enable';
