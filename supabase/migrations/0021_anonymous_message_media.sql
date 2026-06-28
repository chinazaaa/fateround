-- Anonymous messages enhancements: GIF/sticker support
ALTER TABLE anonymous_messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'gif'));
ALTER TABLE anonymous_messages ADD COLUMN IF NOT EXISTS media_url text;

-- GIF messages may have empty text; keep max length at 500.
ALTER TABLE anonymous_messages DROP CONSTRAINT IF EXISTS anonymous_messages_text_check;
ALTER TABLE anonymous_messages ADD CONSTRAINT anonymous_messages_text_check
  CHECK (char_length(text) BETWEEN 0 AND 500);
