-- Fix RLS for anonymous_room_bans (upsert needs insert + update policies).
ALTER TABLE anonymous_room_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_anonymous_room_bans" ON anonymous_room_bans;
DROP POLICY IF EXISTS "public_anonymous_room_bans_select" ON anonymous_room_bans;
DROP POLICY IF EXISTS "public_anonymous_room_bans_insert" ON anonymous_room_bans;
DROP POLICY IF EXISTS "public_anonymous_room_bans_update" ON anonymous_room_bans;
DROP POLICY IF EXISTS "public_anonymous_room_bans_delete" ON anonymous_room_bans;

CREATE POLICY "public_anonymous_room_bans_select" ON anonymous_room_bans
  FOR SELECT USING (true);

CREATE POLICY "public_anonymous_room_bans_insert" ON anonymous_room_bans
  FOR INSERT WITH CHECK (true);

CREATE POLICY "public_anonymous_room_bans_update" ON anonymous_room_bans
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "public_anonymous_room_bans_delete" ON anonymous_room_bans
  FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON anonymous_room_bans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON anonymous_room_bans TO authenticated;
GRANT ALL ON anonymous_room_bans TO service_role;
