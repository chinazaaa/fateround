-- Whot: hide the ordered deck from the publishable anon key. THE REVOKE.
--
-- ⚠️ DO NOT APPLY TO PRODUCTION until a compatible mobile build has shipped and old installs
-- have drained. PostgREST fails the WHOLE select with 42501 when any requested column is revoked,
-- installed builds still request `draw_pile`/`discard_pile`, and OTA cannot rescue them —
-- expo-updates reads config baked into the native binary at build time. Merging into `dev` is
-- safe: installed builds read the PRODUCTION project, so the exposure is at the dev → main
-- promotion, which the Mobile Rollout Gate blocks without an explicit MOBILE-ROLLOUT-ACK.
--
-- This was the last unredacted deck. docs/rls-hardening.md said "Whot's whot_sessions has the
-- identical leak and is left to its own PR" — this is that PR. Demonstrated, not theorised:
-- with hosted-parity grants applied locally, scripts/playtest/redaction-playtest.mjs reported
--
--   LEAK: anon read whot_sessions.draw_pile (200)
--     [{"draw_pile":[{"id":"whot-20-1",...},{"id":"cross-5",...}, ...]}]
--
-- i.e. the full ordered deck, readable with the publishable key. With `draw_pile` +
-- `discard_pile` and your own hand, a 2-player opponent's hand is a subtraction, and at any table
-- size you know every future draw in order.
--
-- Nothing client-side loses information it legitimately had: every reader used only `.length`
-- (WhotBoard, WhotHostView, WhotPlayerView, the mobile view, and isDrawPileDepleted). The
-- generated draw_count/discard_count from 20261120115000 cover exactly that, and `top_card` is a
-- separate column that stays public — it is face-up at the table anyway.
--
-- Server-side play (src/lib/whot.ts) reads and rewrites the piles through the service role, which
-- a column revoke does not affect.
--
-- ⚠️ FUTURE SCHEMA CHANGES: anon/authenticated now hold COLUMN-level (not table-level) SELECT on
-- whot_sessions. A NEW column must also be granted (re-running the do-block below does that), or
-- client reads of it error. Fails closed — a read error, never a deck leak.
do $$
declare
  session_cols text;
  role_name text;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'whot_sessions'
  ) then
    raise notice 'whot_sessions not present — skipping';
    return;
  end if;

  -- Fail loudly if the additive sibling has not run: revoking the piles without the counts would
  -- leave clients unable to render pile sizes at all.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'whot_sessions' and column_name = 'draw_count'
  ) then
    raise exception 'draw_count is absent — 20261120115000_whot_pile_counts.sql must run first';
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into session_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'whot_sessions'
     and column_name not in ('draw_pile', 'discard_pile');

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.whot_sessions from %I', role_name);
    execute format('grant select (%s) on public.whot_sessions to %I', session_cols, role_name);
  end loop;
end $$;
