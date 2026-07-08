-- Add scope column for mafia_chat_messages
ALTER TABLE mafia_chat_messages ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'night' CHECK (scope IN ('night', 'day'));

-- Remove from realtime publication so night chat is never broadcast to clients
-- The server-only state API handles all chat reads, enforcing scope & role visibility
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE mafia_chat_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop permissive SELECT policy (no client should read this table directly)
DROP POLICY IF EXISTS "mafia_chat_messages_read" ON mafia_chat_messages;
