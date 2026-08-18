-- Discovery Phase C follow-up — attach a display name to each RSVP so the
-- scheduled-game "Transfer host" picker (mobile) has something readable to
-- render. Without this, RSVPers are just opaque device UUIDs.
--
-- Nullable — old rows populated before this migration have no name; the UI
-- falls back to "Anon" in that case. Server-only writes (RLS unchanged).

alter table public.game_rsvps add column if not exists display_name text;
