ALTER TABLE anonymous_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES anonymous_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_text text CHECK (
    reply_to_text IS NULL OR char_length(reply_to_text) BETWEEN 1 AND 200
  );

CREATE INDEX IF NOT EXISTS idx_anonymous_messages_reply_to ON anonymous_messages(reply_to_id);
