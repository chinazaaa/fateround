-- Runtime security invariants for the FateRound database.
--
-- Run against a migrated database to assert that the RLS/grant hardening has not
-- regressed. RAISEs EXCEPTION (non-zero) on the first violation, so it works as a CI
-- gate or a manual audit:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/security-invariants.sql
--
-- The root cause of the 2026-07 audit findings was that the RLS lockdown was a manual,
-- point-in-time sweep and every table/function added afterwards silently regressed.
-- These checks are the automated backstop: add a table/function to the appropriate
-- allowlist ONLY with a deliberate justification.

do $$
declare
  v_bad text;
begin
  -- 1) The privileged RPCs hardened in 20260803120000 must NOT be EXECUTE-able by
  --    anon or authenticated. Their only legitimate caller is the service-role client.
  select string_agg(fn, ', ') into v_bad
  from (
    select unnest(array[
      'public.word_rush_add_score(text, uuid, integer)',
      'public.codewords_process_guess(uuid, integer, text)',
      'public.restart_tournament(text)',
      'public.rotate_player_resume_token(text, text)'
    ]) as fn
  ) f
  where to_regprocedure(f.fn) is not null
    and (
      has_function_privilege('anon', f.fn, 'EXECUTE')
      or has_function_privilege('authenticated', f.fn, 'EXECUTE')
    );
  if v_bad is not null then
    raise exception 'SECURITY INVARIANT FAILED: anon/authenticated can EXECUTE privileged RPC(s): %', v_bad;
  end if;

  -- 2) Secret credential columns must NOT be readable by anon.
  select string_agg(t.tbl || '.' || t.col, ', ') into v_bad
  from (
    values
      ('games', 'host_token'),
      ('players', 'resume_token'),
      ('tournaments', 'host_token'),
      ('rooms', 'creator_token'),
      ('room_members', 'member_code')
  ) as t(tbl, col)
  where to_regclass('public.' || t.tbl) is not null
    and exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name = t.col
    )
    and has_column_privilege('anon', ('public.' || t.tbl)::regclass, t.col, 'SELECT');
  if v_bad is not null then
    raise exception 'SECURITY INVARIANT FAILED: anon can SELECT secret column(s): %', v_bad;
  end if;

  -- 3) Tables holding secret/hidden state or server-only writes must NOT expose any
  --    anon INSERT/UPDATE/DELETE (a permissive write policy). SELECT-only is fine.
  --    A policy applies to anon if it targets role 'anon' or PUBLIC ('public'/{0}).
  select string_agg(distinct p.tablename || ' (' || p.policyname || ')', ', ') into v_bad
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      -- newer game modes + tournaments locked in phase 6
      'quiplash_sessions','quiplash_answers','quiplash_battles','quiplash_votes',
      'quick_draw_sessions','quick_draw_assignments','quick_draw_drawings',
      'quick_draw_titles','quick_draw_votes',
      'quick_draw_guess_sessions','quick_draw_guess_players','quick_draw_guess_words',
      'quick_draw_guess_guesses',
      'memory_match_progress','memory_match_submissions','ping_pong_sessions',
      'tournaments','tournament_players','tournament_games',
      'anonymous_messages','anonymous_room_bans'
    )
    and p.cmd in ('ALL','INSERT','UPDATE','DELETE')
    and (p.roles is null or 'anon' = any(p.roles) or 'public' = any(p.roles));
  if v_bad is not null then
    raise exception 'SECURITY INVARIANT FAILED: anon-writable policy on locked table(s): %', v_bad;
  end if;

  -- 4) Hidden/secret-state tables must expose NO policy to anon at all (service-role
  --    only). Any policy naming anon/public here is a leak.
  select string_agg(distinct p.tablename || ' (' || p.policyname || ')', ', ') into v_bad
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      'jikan_search_cache','jikan_anime_cache',
      'mafia_player_states','mafia_sessions',
      'mahjong_player_state','landmine_round_mines'
    )
    and (p.roles is null or 'anon' = any(p.roles) or 'public' = any(p.roles));
  if v_bad is not null then
    raise exception 'SECURITY INVARIANT FAILED: anon-visible policy on service-role-only table(s): %', v_bad;
  end if;

  -- 5) The two RLS-less cache tables must have RLS enabled.
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('jikan_search_cache','jikan_anime_cache')
    and c.relrowsecurity = false;
  if v_bad is not null then
    raise exception 'SECURITY INVARIANT FAILED: RLS not enabled on: %', v_bad;
  end if;

  raise notice 'All security invariants passed.';
end $$;
