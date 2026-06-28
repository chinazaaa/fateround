CREATE TABLE IF NOT EXISTS anonymous_room_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  banned_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_anonymous_room_bans_game_id ON anonymous_room_bans(game_id);
CREATE INDEX IF NOT EXISTS idx_anonymous_room_bans_player ON anonymous_room_bans(game_id, player_id);

ALTER TABLE anonymous_room_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_anonymous_room_bans" ON anonymous_room_bans;

drop policy if exists "public_anonymous_room_bans_select" on anonymous_room_bans;
CREATE POLICY "public_anonymous_room_bans_select" ON anonymous_room_bans
  FOR SELECT USING (true);

drop policy if exists "public_anonymous_room_bans_insert" on anonymous_room_bans;
CREATE POLICY "public_anonymous_room_bans_insert" ON anonymous_room_bans
  FOR INSERT WITH CHECK (true);

drop policy if exists "public_anonymous_room_bans_update" on anonymous_room_bans;
CREATE POLICY "public_anonymous_room_bans_update" ON anonymous_room_bans
  FOR UPDATE USING (true) WITH CHECK (true);

drop policy if exists "public_anonymous_room_bans_delete" on anonymous_room_bans;
CREATE POLICY "public_anonymous_room_bans_delete" ON anonymous_room_bans
  FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON anonymous_room_bans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON anonymous_room_bans TO authenticated;
GRANT ALL ON anonymous_room_bans TO service_role;

do $$ begin alter publication supabase_realtime add table anonymous_room_bans; exception when duplicate_object then null; end $$;
