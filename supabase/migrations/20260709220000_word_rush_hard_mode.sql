-- Word Rush hard mode: escalating minimum word length per round.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS word_rush_difficulty text NOT NULL DEFAULT 'standard'
  CHECK (word_rush_difficulty IN ('standard', 'hard'));

ALTER TABLE word_rush_sessions
  ADD COLUMN IF NOT EXISTS difficulty text NOT NULL DEFAULT 'standard'
  CHECK (difficulty IN ('standard', 'hard'));

ALTER TABLE word_rush_sessions
  ADD COLUMN IF NOT EXISTS min_word_length integer NOT NULL DEFAULT 3;
