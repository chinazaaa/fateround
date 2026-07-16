-- Add the Robin Hood Estate Dividend house-rule column.
-- When enabled, a departing player's estate (properties + cash) is liquidated
-- and split equally among the remaining active players.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS monopoly_estate_dividend boolean DEFAULT false;

-- Re-grant column-level SELECT so anon/authenticated can read the new column.
-- (Migration 0122 grants named columns only — ALTER TABLE ADD COLUMN does not extend it.)
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
