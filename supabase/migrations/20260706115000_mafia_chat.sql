-- Create mafia_chat_messages table
CREATE TABLE IF NOT EXISTS mafia_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sender_player_id text NOT NULL,
  sender_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS (public cannot read or write directly)
ALTER TABLE mafia_chat_messages ENABLE ROW LEVEL SECURITY;

-- Add index on game_id
CREATE INDEX IF NOT EXISTS idx_mafia_chat_messages_game_id ON mafia_chat_messages(game_id);

-- Register to publication for realtime broadcast
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mafia_chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
