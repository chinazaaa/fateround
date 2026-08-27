-- Crazy Eights: hide the ordered deck from the publishable anon key. THE REVOKE.
--
-- ⚠️ DO NOT APPLY TO PRODUCTION until a compatible mobile build has shipped and old installs have
-- drained. This is step 2 of the split in docs/rls-hardening.md § "Split the migration: additive
-- first, revoke last" — the counts are added by the sibling 20260815115000_crazy8_pile_counts.sql,
-- which is safe against every client version and can go first.
--
-- Why the wait is real: PostgREST fails the WHOLE select with 42501 when any requested column is
-- revoked, installed mobile builds still select `draw_pile`/`discard_pile`, and OTA cannot rescue
-- them — `expo-updates` reads its config from the native binary, baked at build time. This is a
-- store-release wait or a recorded breakage window, not something a hotfix can undo. The
-- dev → main Mobile Rollout Gate enforces this; merging into `dev` is safe, because installed
-- builds read the PRODUCTION Supabase project.
--
-- Redacting `crazy_eights_player_hands.cards` (this branch) buys very little while
-- `crazy_eights_sessions.draw_pile` still ships the FULL ORDERED DECK to every client:
--
--   * In a 2-player game, `draw_pile` + `discard_pile` + your own hand subtract from the known
--     52-card deck to give your opponent's exact hand.
--   * In an N-player game you still know every future draw, in order.
--
-- Both piles are therefore revoked with the same do-block used for `codewords_boards.key`
-- (20260803170000) and `games.host_token` (0122).
--
-- Nothing client-side loses information it legitimately had: every browser/mobile reader used
-- only `.length` of these arrays (`CrazyEightsBoard.tsx`, `CrazyEightsPlayerView.tsx`,
-- `CrazyEightsHostView.tsx`, `isDrawPileDepleted`), and the face-up card is a separate
-- `top_card` column that stays public. The generated `draw_count` / `discard_count` added by the
-- sibling migration replace the two legitimate uses — counts reveal nothing about ORDER or
-- IDENTITY, which is the actual secret.
--
-- Server-side play (src/lib/crazy-eights.ts) reads and rewrites the piles through the service
-- role, which is unaffected by a column revoke.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level (not table-level) SELECT on
-- `crazy_eights_sessions`. A NEW column must also be granted (re-running the do-block below does
-- that), or client reads of it will error. Fails closed — a read error, never a deck leak.
do $$
declare
  session_cols text;
  role_name text;
begin
  -- Skip rather than abort where the table hasn't been created yet (a fresh environment applying
  -- migrations out of order), matching 20260803170000's guard.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'crazy_eights_sessions'
  ) then
    raise notice 'crazy_eights_sessions not present — skipping';
    return;
  end if;

  -- Fail loudly if the additive sibling has not run: revoking the piles without the counts in
  -- place would leave clients with no way to render pile sizes at all.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'crazy_eights_sessions'
       and column_name = 'draw_count'
  ) then
    raise exception 'draw_count is absent — 20260815115000_crazy8_pile_counts.sql must run before this migration';
  end if;

  select string_agg(quote_ident(column_name), ', ')
    into session_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'crazy_eights_sessions'
     and column_name not in ('draw_pile', 'discard_pile');

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.crazy_eights_sessions from %I', role_name);
    execute format('grant select (%s) on public.crazy_eights_sessions to %I', session_cols, role_name);
  end loop;
end $$;
