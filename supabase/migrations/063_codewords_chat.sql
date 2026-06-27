CREATE TABLE IF NOT EXISTS codewords_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team text NOT NULL CHECK (team IN ('red', 'blue')),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codewords_messages_game_team ON codewords_messages(game_id, team, created_at);

ALTER TABLE codewords_messages ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_codewords_messages" on codewords_messages;
CREATE POLICY "public_codewords_messages" ON codewords_messages FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table codewords_messages; exception when duplicate_object then null; end $$;
