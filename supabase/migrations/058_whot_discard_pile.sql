ALTER TABLE whot_sessions
  ADD COLUMN IF NOT EXISTS discard_pile jsonb NOT NULL DEFAULT '[]';
