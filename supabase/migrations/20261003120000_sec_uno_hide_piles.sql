-- ⚠️ DO NOT APPLY TO PRODUCTION until a compatible mobile build has shipped and old installs
-- have drained.
--
-- Verified against origin/main: the shipped build's UNO_SESSION_SELECT still requests
-- `draw_pile` and `discard_pile` — on web AND mobile. PostgREST fails the WHOLE query with 42501
-- when any requested column is revoked, so applying this to the production project breaks UNO on
-- every installed build. A web deploy reverts in a minute; an installed binary does not, and OTA
-- cannot rescue it — expo-updates reads its config from the native binary, baked at build time.
-- That is a store-release wait or a recorded breakage window, not something a hotfix can undo.
--
-- Merging into `dev` is safe: installed builds read the PRODUCTION Supabase project. The exposure
-- is at the dev → main promotion, which the Mobile Rollout Gate blocks without an explicit
-- MOBILE-ROLLOUT-ACK. Same reasoning as 20260815120000_sec_crazy8_hide_piles.sql and
-- 20260815130000_sec_ttl_hide_guesses.sql.
--
-- UNO: hide the ordered deck from the publishable anon key.
--
-- Redacting `uno_player_hands.cards` (this branch) buys very little while
-- `uno_sessions.draw_pile` still ships the FULL ORDERED DECK to every client. Observed live on
-- dev: 86 ordered cards in a single `draw_pile`, readable with the publishable anon key.
--
--   * In a 2-player game, `draw_pile` + `discard_pile` + your own hand subtract from the known
--     108-card deck to give your opponent's EXACT hand.
--   * In an N-player game you still know every future draw, in order — which is enough to play
--     the Draw Two / Wild Draw Four / challenge decisions perfectly.
--
-- Both piles are therefore revoked with the same do-block used for `crazy_eights_sessions`
-- (20260815120000), `codewords_boards.key` (20260803170000) and `games.host_token` (0122).
--
-- Nothing client-side loses information it legitimately had: every browser/mobile reader used
-- only `.length` of these arrays (`UnoPlayerView.tsx` web + mobile, `UnoHostView.tsx`,
-- `isDrawPileDepleted`), and the face-up card is a separate `top_card` column that stays public.
-- Generated `draw_count` / `discard_count` replace the two legitimate uses — a count reveals
-- neither the ORDER nor the IDENTITY of the cards, which is the actual secret.
--
-- Server-side play (src/lib/uno.ts) reads and rewrites the piles through the service role, which
-- is unaffected by a column revoke.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level (not table-level) SELECT on
-- `uno_sessions`. A NEW column must also be granted (re-running the do-block below does that), or
-- client reads of it will error. Fails closed — a read error, never a deck leak.

do $$
declare
  session_cols text;
  role_name text;
begin
  -- Skip rather than abort where the table hasn't been created yet (a fresh environment applying
  -- migrations out of order), matching 20260815120000's guard.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'uno_sessions'
  ) then
    raise notice 'uno_sessions not present — skipping';
    return;
  end if;

  -- Public pile sizes. Stored + generated, so they can never drift from the piles they count and
  -- no application code has to maintain them. These columns are jsonb (NOT postgres arrays), so
  -- this is jsonb_array_length, not cardinality. Both it and jsonb_typeof are immutable, which is
  -- what a generated column requires. The typeof guard keeps the count 0 rather than erroring on
  -- a null pile or a non-array value.
  alter table public.uno_sessions
    add column if not exists draw_count integer
    generated always as (
      case when jsonb_typeof(draw_pile) = 'array' then jsonb_array_length(draw_pile) else 0 end
    ) stored;

  alter table public.uno_sessions
    add column if not exists discard_count integer
    generated always as (
      case when jsonb_typeof(discard_pile) = 'array' then jsonb_array_length(discard_pile) else 0 end
    ) stored;

  select string_agg(quote_ident(column_name), ', ')
    into session_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'uno_sessions'
     and column_name not in ('draw_pile', 'discard_pile');

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.uno_sessions from %I', role_name);
    execute format('grant select (%s) on public.uno_sessions to %I', session_cols, role_name);
  end loop;
end $$;
