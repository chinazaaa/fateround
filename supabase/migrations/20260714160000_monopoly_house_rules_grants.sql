-- Re-grant column-level SELECT on games/players after the monopoly house-rule columns.
--
-- Migration 0122 grants anon/authenticated SELECT on named columns only (not table-wide),
-- so `ALTER TABLE games ADD COLUMN` does NOT extend the grant. New games columns must
-- re-run this block or client reads error with "permission denied for table games" (42501).
--
-- 20260713140000_monopoly_house_rules.sql added monopoly_double_go_salary,
-- monopoly_forced_auctions and monopoly_no_rent_in_jail without re-granting. All three are
-- in GAME_SELECT — the shared game read used by every host and player view — so an anon
-- read of `games` fails for EVERY game type, not just Monopoly.
--
-- This is the last dynamic re-grant since 20260710194000_ayo_variant_column_grants.sql, so
-- running the block also closes any other gap that crept in since (it grants all current
-- columns, still excluding the secret host_token / resume_token). Idempotent — safe on
-- every environment, including ones where the grant was already applied by hand.

do $$
declare
  game_cols text;
  player_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  select string_agg(quote_ident(column_name), ', ')
    into player_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name <> 'resume_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
    execute format('revoke select on public.players from %I', role_name);
    execute format('grant select (%s) on public.players to %I', player_cols, role_name);
  end loop;
end $$;
