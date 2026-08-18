-- Lock down public writes to solo_plays.
--
-- 20260927120000_solo_plays.sql granted anon+authenticated INSERT so browser
-- clients could log solo games directly via PostgREST. That path was never
-- used — the four solo clients (`logSoloPlayStarted` in src/lib/solo-play.ts)
-- POST to /api/solo-plays, which validates the payload and inserts with the
-- service-role key. The anon INSERT policy is therefore pure attack surface:
-- anyone with the public anon key could spam arbitrary game_type rows through
-- PostgREST and inflate the admin dashboard's solo-adoption counts.
--
-- Reads were never granted to anon; this migration only closes the write hole.

drop policy if exists "anon insert solo_plays" on public.solo_plays;
revoke insert on public.solo_plays from anon, authenticated;
