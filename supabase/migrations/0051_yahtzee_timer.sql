-- Add per-turn deadline to yahtzee sessions (null = no timer)
ALTER TABLE yahtzee_sessions ADD COLUMN IF NOT EXISTS turn_deadline_at timestamptz;
