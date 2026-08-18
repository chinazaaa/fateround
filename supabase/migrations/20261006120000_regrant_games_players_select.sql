-- Re-grant column-level SELECT on games/players to the public roles.
--
-- Discovery Phase A + C added new columns to `games`:
--   last_activity_at, host_idle_warning_sent_at, result_reason (Phase A)
--   scheduled_at, opened_at                                   (Phase C)
--
-- The last re-grant (20260704150000_regrant_games_players_select.sql) scoped
-- anon/authenticated SELECT to the columns present AT THAT TIME. Every column
-- added afterwards is NOT in the grant list, so PostgREST refuses selects that
-- reference the new ones — the host page surfaces this as the misleading
-- "Can't reach the server / database is slow" load-error state.
--
-- This migration re-runs the dynamic grant block (same shape as previous
-- regrants). Idempotent — safe on every environment; also closes any other
-- column gaps that crept in since the last re-grant.

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
