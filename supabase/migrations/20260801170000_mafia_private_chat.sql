-- Add target_player_id for private system messages (investigation results, etc.)
-- visible only to that player in their Town Discussion feed.
ALTER TABLE mafia_chat_messages ADD COLUMN IF NOT EXISTS target_player_id text;

-- Column-level grant so the admin service key can read/write it
GRANT SELECT (target_player_id) ON mafia_chat_messages TO authenticated;
GRANT SELECT (target_player_id) ON mafia_chat_messages TO anon;
