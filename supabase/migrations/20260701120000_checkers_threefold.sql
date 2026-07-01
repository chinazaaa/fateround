-- Checkers: track position occurrences so the engine can call a draw by
-- threefold repetition. Keyed by "<board>:<side-to-move>"; the count resets to
-- {} on any irreversible move (capture, man advance, or crowning), since those
-- positions can never recur.
ALTER TABLE checkers_sessions
  ADD COLUMN IF NOT EXISTS position_counts jsonb NOT NULL DEFAULT '{}'::jsonb;
