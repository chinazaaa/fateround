-- Keep all clues the describer has given for the CURRENT word (reset each word),
-- so the describer can see what they've already said and avoid repeating.
ALTER TABLE describe_it_sessions
  ADD COLUMN IF NOT EXISTS current_clues text[] NOT NULL DEFAULT '{}';
