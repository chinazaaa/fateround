-- Re-grant column-level SELECT on games/players to the public roles.
--
-- Migration 0122 switched anon/authenticated from table-level to COLUMN-level
-- SELECT on these tables (every column except the secret host_token/resume_token),
-- and documented that any column added afterwards must re-run that grant block or
-- client reads break with "permission denied for table games" (42501).
--
-- Columns were since added without re-granting (e.g. games.elimination_config and
-- players.is_eliminated / eliminated_at / lives_remaining from the elimination
-- migration), so anon reads of those tables started failing. Re-running the block
-- regrants SELECT on all current columns (still excluding the secret tokens) and is
-- idempotent, so it's safe on every environment and picks up future gaps if re-run.

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
