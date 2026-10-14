-- Rummy: hide the hands and the ordered deck from the publishable anon key. THE REVOKE.
--
-- This is the first HAND revoke in the repo. Phase 7 (docs/rls-hardening.md) built the redaction
-- route for five card games and then stopped: `*_player_hands.cards` has never been revoked
-- anywhere, so every opponent's hand has remained readable with the anon key the whole time. The
-- routes only stopped the browser ASKING. `src/lib/hand-redaction.ts` says it plainly — a plain
-- `select player_id, cards from whot_player_hands` returned every hand in every game.
--
-- Rummy goes first because it is the only one of the five that is not gated on a mobile release:
-- `apps/mobile` ships no Rummy view at all (only the slug in lib/game-rules.ts;
-- app/game/[code].tsx falls back to opening the web room), so there is no installed binary to
-- drain. Whot, UNO, Crazy Eights and Go Fish still are gated, and their revokes are not here.
--
-- ⚠️ DO NOT APPLY TO PRODUCTION until the web deploy carrying #1213 is live. PostgREST fails the
-- WHOLE select with 42501 when any requested column is revoked, so this breaks Rummy for any
-- client still naming these columns. The shipped web build before #1213 selected `cards` directly
-- in RummyPlayerView/RummyHostView and both piles in RUMMY_SESSION_SELECT. A web deploy reverts
-- in a minute, which is the entire reason Rummy can go first.
--
-- Merging into `dev` is safe: browsers read the PRODUCTION project, so the exposure is at the
-- dev -> main promotion. That promotion is blocked by the Mobile Rollout Gate without
-- MOBILE-ROLLOUT-ACK, because this file matches `\brevoke\b`. The gate is keyword-based and
-- cannot tell that Rummy has no mobile surface — whoever acks it should know the check that
-- matters here is "is the post-#1213 web build live in production", not "has a store release
-- shipped".
--
-- WHAT IS BEING CLOSED
--
--   * `rummy_player_hands.cards` — every opponent's hand, in full. Both views used to select it
--     filtered on `game_id` alone, with no player filter. Clients now read
--     POST /api/rummy/hands, which returns the caller's own cards and everyone else's as a
--     `card_count` (src/lib/hand-redaction.ts).
--   * `rummy_sessions.draw_pile` / `discard_pile` — the FULL ORDERED DECK. Redacting hands while
--     the deck ships is bypassable by subtraction: in a 2-player game the deck plus the discard
--     plus your own hand give the opponent's exact hand, and at any table size you know every
--     future draw in order. That is the Crazy Eights argument from
--     20260815120000_sec_crazy8_hide_piles.sql, and it is why both halves have to land together.
--
-- Nothing client-side loses information it legitimately had. The only reader of either pile was
-- RummyBoard's draw count, now served by the generated `draw_count` added in
-- 20261127120000_rummy_pile_counts.sql; `discard_pile` had no client reader at all, since the
-- face-up card is the separate `top_discard` column, which stays public. Server-side play
-- (src/lib/rummy.ts) reads both tables with `select('*')` through the SERVICE ROLE, which a
-- revoke on anon/authenticated does not affect.
--
-- ⚠️ EXCEPT IN LOCAL DEV, where that sentence is false and this migration will look like a bug.
-- getSupabaseAdmin() (src/lib/supabase-admin.ts) throws in production if
-- SUPABASE_SERVICE_ROLE_KEY is missing, but OUTSIDE production it warns and falls back to the
-- ANON key. So a `next dev` with only the anon key in .env.local, pointed at a project where this
-- has applied, issues those `select('*')` calls as anon and gets 42501 — every /api/rummy/* move
-- and every hand fetch fails. It presents as a frozen board, not as a missing-env error, because
-- the views deliberately keep the last known hands when a fetch returns null. Set
-- SUPABASE_SERVICE_ROLE_KEY locally. This is new: before the revoke the anon fallback worked on
-- these tables.
--
-- REALTIME. Revoking is the only thing that narrows a postgres_changes payload — Realtime filters
-- columns per subscriber via has_column_privilege in realtime.apply_rls. A publication column
-- list does NOT work; see the correction appended to 20261110120000_monopoly_realtime_columns.sql.
-- Both tables stay in the publication and anon keeps SELECT on their other columns.
--
-- That a partially-privileged subscriber still RECEIVES the event is measured, not assumed:
-- docs/games-column-revoke-audit.md records an anon `games` frame dropping 12,305 -> 9,930 bytes
-- (-19.3%) after 29 mafia_* columns were revoked, against a control where a publication column
-- list moved it by one byte. A frame that arrived pruned is the observation. Crazy Eights, UNO and
-- Whot all run on realtime today with revoked piles.
--
-- ⚠️ But know what is being bet, because the failure mode is a SOFT-LOCK, not a slowdown. If
-- events stopped reaching anon, `useGameTableSync`'s `connected` would stay true — it reports
-- channel health (SUBSCRIBED + live socket), never event delivery — and the fallback poll is
-- gated on `!connected`, so it would stay OFF. The acting player's own `await load()` keeps them
-- current; every OPPONENT's board freezes, never sees the turn pass, and times out. That is what
-- the playtest before the production promotion is actually checking.
--
-- Uses public.sec_regrant_except (20260807110000) rather than a fourth hand-rolled copy of the
-- do-block. It VALIDATES the excluded column names and raises on a typo, where a hand-rolled
-- block would silently re-grant the secret. That helper's own closing note says it should be
-- adopted the next time a table's grants change; this is that time.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level (not table-level) SELECT on
-- both tables. Any NEW column must also be granted (re-running sec_regrant_except does that), or
-- client reads of it fail with 42501. Fails closed — a read error, never a leak.
do $$
begin
  if to_regclass('public.rummy_sessions') is null or to_regclass('public.rummy_player_hands') is null then
    raise notice 'rummy tables not present — skipping';
    return;
  end if;

  -- Fail loudly if the additive sibling has not run: revoking the piles without the counts leaves
  -- clients with no way to render the deck size at all.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'rummy_sessions' and column_name = 'draw_count'
  ) then
    raise exception 'draw_count is absent — 20261127120000_rummy_pile_counts.sql must run first';
  end if;

  perform public.sec_regrant_except('rummy_sessions', array['draw_pile', 'discard_pile']);
  perform public.sec_regrant_except('rummy_player_hands', array['cards']);

  -- Defensive, matching 20260815130000_sec_ttl_hide_guesses.sql: the API routes read both tables
  -- through the service role, and that must not depend on inherited defaults surviving a
  -- table-level revoke. Guarded so a local database without the role still applies cleanly.
  if to_regrole('service_role') is not null then
    execute 'grant all on table public.rummy_sessions to service_role';
    execute 'grant all on table public.rummy_player_hands to service_role';
  end if;
end $$;

notify pgrst, 'reload schema';
