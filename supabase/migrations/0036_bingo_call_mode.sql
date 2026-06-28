ALTER TABLE games
  ADD COLUMN IF NOT EXISTS bingo_call_mode text NOT NULL DEFAULT 'manual'
    CHECK (bingo_call_mode IN ('manual', 'auto'));

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS bingo_call_interval_seconds integer NOT NULL DEFAULT 5
    CHECK (bingo_call_interval_seconds >= 2 AND bingo_call_interval_seconds <= 30);
