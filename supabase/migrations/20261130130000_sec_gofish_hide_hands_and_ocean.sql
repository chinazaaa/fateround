-- Go Fish: hide every hand and the ordered ocean from the publishable anon key. THE REVOKE.
--
-- Go Fish (20261106130000_gofish.sql) was added after Phase 7 (docs/rls-hardening.md) and never
-- got the equivalent of the Rummy / Crazy Eights revokes. Confirmed against production with only
-- the public anon key:
--
--   GET /rest/v1/gofish_sessions?game_id=eq.<CODE>&select=ocean        -> the full ordered draw pile
--   GET /rest/v1/gofish_player_hands?select=player_id,cards            -> EVERY player's hand
--
-- WHAT IS BEING CLOSED
--
--   * `gofish_player_hands.cards` — every opponent's hand. Clients already read
--     POST /api/gofish/hands, which returns the caller's own cards and everyone else's as a
--     `card_count` (src/lib/hand-redaction.ts). `books` stays public: completed books are face-up
--     in the physical game.
--   * `gofish_sessions.ocean` — the face-down draw pile in draw order (ocean[0] is the next
--     draw). Redacting hands while this ships is bypassable by subtraction. The public size is
--     the existing `ocean_count` column, which stays readable.
--
-- Nothing client-side loses information it legitimately had:
--   * Web: GoFishPlayerView / GoFishHostView select GOFISH_SESSION_SELECT (no `ocean`) and fetch
--     hands through fetchGoFishHands -> /api/gofish/hands. Their realtime subscriptions on
--     gofish_player_hands only trigger a reload; payloads are never applied as state.
--   * Mobile: apps/mobile ships NO Go Fish view (only the slug in lib/game-rules.ts; the game
--     screen falls back to opening the web room), so there is no installed binary to drain.
--   * Server: src/lib/gofish-server.ts, the /api/gofish/* routes, room-points and trophy facts
--     read both tables with `select('*')` / `cards` through the SERVICE ROLE, which a revoke on
--     anon/authenticated does not affect.
--
-- ⚠️ DEPLOY ORDER: PostgREST fails the WHOLE select with 42501 when any requested column is
-- revoked, so any client still naming `ocean` or `cards` directly would break. The current web
-- build does not; confirm the web build carrying the /api/gofish/hands switch is live in
-- production before applying.
--
-- ⚠️ LOCAL DEV: getSupabaseAdmin() falls back to the ANON key outside production when
-- SUPABASE_SERVICE_ROLE_KEY is missing; after this applies, /api/gofish/* then fails with 42501.
-- Set SUPABASE_SERVICE_ROLE_KEY locally.
--
-- REALTIME: revoking is what narrows a postgres_changes payload (per-subscriber
-- has_column_privilege in realtime.apply_rls). Both tables stay in the publication and anon keeps
-- SELECT on every other column. See the same note in 20261128120000_sec_rummy_hide_hands_and_piles.sql.
--
-- Uses public.sec_regrant_except (20260807110000), which VALIDATES the excluded column names and
-- raises on a typo. Idempotent: re-running re-grants the same column set.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level SELECT on both tables. Any
-- NEW column must also be granted (re-run sec_regrant_except), or client reads of it fail with
-- 42501. Fails closed — a read error, never a leak.
do $$
begin
  if to_regclass('public.gofish_sessions') is null or to_regclass('public.gofish_player_hands') is null then
    raise notice 'gofish tables not present — skipping';
    return;
  end if;

  perform public.sec_regrant_except('gofish_sessions', array['ocean']);
  perform public.sec_regrant_except('gofish_player_hands', array['cards']);

  -- Defensive: API routes read both tables through the service role, which must not depend on
  -- inherited defaults surviving a table-level revoke. Guarded for databases without the role.
  if to_regrole('service_role') is not null then
    execute 'grant all on table public.gofish_sessions to service_role';
    execute 'grant all on table public.gofish_player_hands to service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
