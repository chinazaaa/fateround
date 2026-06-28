ALTER TABLE codewords_boards
  ADD COLUMN IF NOT EXISTS spymaster_timer_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS operative_timer_seconds integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS turn_phase text NOT NULL DEFAULT 'clue' CHECK (turn_phase IN ('clue', 'guess')),
  ADD COLUMN IF NOT EXISTS turn_deadline_at timestamptz;

ALTER TABLE games ADD COLUMN IF NOT EXISTS operative_timer_seconds integer;
