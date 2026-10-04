-- UNO: hide the ordered deck from the publishable anon key. THE REVOKE.
--
-- ⚠️ DO NOT APPLY TO PRODUCTION until a compatible mobile build has shipped and old installs have
-- drained. Verified against origin/main: the shipped build's UNO_SESSION_SELECT still requests
-- `draw_pile` and `discard_pile`, on web AND mobile. PostgREST fails the WHOLE query with 42501
-- when any requested column is revoked, so this breaks UNO on every installed build the moment it
-- reaches production. A web deploy reverts in a minute; an installed binary does not, and OTA
-- cannot rescue it — expo-updates reads its config from the native binary, baked at build time.
--
-- Merging into `dev` is safe: installed builds read the PRODUCTION project, so the exposure is at
-- the dev -> main promotion, which the Mobile Rollout Gate blocks without MOBILE-ROLLOUT-ACK.
--
-- Step 2 of the split; the counts are added by 20261003120000_sec_uno_hide_piles.sql.
--
-- WHY: `uno_sessions.draw_pile` ships the FULL ORDERED DECK. Observed live on dev — 86 ordered
-- cards in a single `draw_pile`, readable with the publishable anon key.
--
--   * In a 2-player game, `draw_pile` + `discard_pile` + your own hand subtract from the known
--     108-card deck to give your opponent's EXACT hand.
--   * In an N-player game you still know every future draw, in order — enough to play the
--     Draw Two / Wild Draw Four / challenge decisions perfectly.
--
-- Nothing client-side loses information it legitimately had: every reader used only `.length`
-- (UnoPlayerView web + mobile, UnoHostView, isDrawPileDepleted). `top_card` stays public, being
-- face-up at the table anyway. Server-side play (src/lib/uno.ts) reads the piles through the
-- service role, which a column revoke does not affect.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level (not table-level) SELECT on
-- `uno_sessions`. A NEW column must also be granted (re-running the do-block below does that), or
-- client reads of it error. Fails closed — a read error, never a deck leak.
do $$
declare
  session_cols text;
  role_name text;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'uno_sessions'
  ) then
    raise notice 'uno_sessions not present — skipping';
    return;
  end if;

  -- Fail loudly if the additive sibling has not run: revoking the piles without the counts leaves
  -- clients with no way to render pile sizes at all.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'uno_sessions' and column_name = 'draw_count'
  ) then
    raise exception 'draw_count is absent — 20261003120000_sec_uno_hide_piles.sql must run first';
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
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
