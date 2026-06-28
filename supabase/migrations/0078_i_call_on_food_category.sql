ALTER TABLE npat_answers ADD COLUMN IF NOT EXISTS food text NOT NULL DEFAULT '';
ALTER TABLE npat_answers ADD COLUMN IF NOT EXISTS score_food integer;

ALTER TABLE npat_marks ADD COLUMN IF NOT EXISTS valid_food boolean NOT NULL DEFAULT true;
