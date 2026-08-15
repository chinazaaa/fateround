-- Event branding for tournaments: two brand colours + optional logo, applied to
-- the lobby, in-game header, and results. Stored as a single jsonb blob rather
-- than three columns so future branding additions (custom title, tagline,
-- background image) don't need another migration.
--
-- Shape: { primaryColor?: string, accentColor?: string, logoUrl?: string }
--   - primaryColor / accentColor: '#rrggbb' hex, validated in the API route.
--   - logoUrl: public URL served from the tournament-branding bucket (below),
--     uploaded via /api/tournaments/{code}/branding/logo.
--
-- Null / empty jsonb = fall back to the app's default palette + no logo, so
-- every existing tournament is untouched.
alter table tournaments add column if not exists branding jsonb;

-- Storage bucket for tournament logos. Public read so the logo renders on the
-- lobby without a signed-URL round-trip. Only the server (service role) writes
-- to it — the upload route authorises the host via their host_token and never
-- exposes an anon write policy — so no INSERT/UPDATE policy for anon here.
insert into storage.buckets (id, name, public)
values ('tournament-branding', 'tournament-branding', true)
on conflict (id) do nothing;

drop policy if exists "public_tournament_branding_read" on storage.objects;
create policy "public_tournament_branding_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'tournament-branding');
