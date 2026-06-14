-- Anonymous messages enhancements: GIF/sticker support
ALTER TABLE anonymous_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text'
  CHECK (message_type IN ('text', 'gif'));
ALTER TABLE anonymous_messages ADD COLUMN media_url text;
