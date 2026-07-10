-- Ayo rule variant + traditional match state (houses, row sizes, rounds).
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS ayo_variant text NOT NULL DEFAULT 'traditional'
  CHECK (ayo_variant IN ('traditional', 'oware'));

ALTER TABLE ayo_sessions
  ADD COLUMN IF NOT EXISTS houses_a integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS houses_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS match_round integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS a_row_size integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS b_row_size integer NOT NULL DEFAULT 6;

ALTER TABLE ayo_sessions DROP CONSTRAINT IF EXISTS ayo_sessions_a_row_size_check;
ALTER TABLE ayo_sessions ADD CONSTRAINT ayo_sessions_a_row_size_check
  CHECK (a_row_size >= 0 AND a_row_size <= 6);

ALTER TABLE ayo_sessions DROP CONSTRAINT IF EXISTS ayo_sessions_b_row_size_check;
ALTER TABLE ayo_sessions ADD CONSTRAINT ayo_sessions_b_row_size_check
  CHECK (b_row_size >= 0 AND b_row_size <= 6);
