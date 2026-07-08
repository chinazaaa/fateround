-- Add scope column and RLS select policy for mafia_chat_messages
ALTER TABLE mafia_chat_messages ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'night' CHECK (scope IN ('night', 'day'));

DROP POLICY IF EXISTS "mafia_chat_messages_read" ON mafia_chat_messages;
CREATE POLICY "mafia_chat_messages_read" ON mafia_chat_messages FOR SELECT USING (true);
