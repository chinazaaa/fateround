-- New bingo games default to automatic number calling.
ALTER TABLE games ALTER COLUMN bingo_call_mode SET DEFAULT 'auto';
