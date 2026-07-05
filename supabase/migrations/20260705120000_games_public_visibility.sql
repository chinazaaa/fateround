-- Public vs private games.
--
-- `private` (the default, and the behaviour up to now) = reachable only by its 6-char code.
-- `public` = additionally listed in the /browse page so anyone can discover and join a game
-- that is still going (a lobby or in progress). Joining is unchanged (by-code, anon RLS open);
-- this only adds discoverability.

alter table games add column if not exists is_public boolean not null default false;

-- Browse query: public + still-going (waiting/active), newest first.
create index if not exists idx_games_public
  on games (is_public, created_at desc)
  where is_public = true and status <> 'finished';

-- Re-grant column-level SELECT on games/players to the public roles.
--
-- 0122 switched anon/authenticated from table-level to COLUMN-level SELECT on these tables
-- (every column except the secret host_token / resume_token). Any column added afterwards —
-- like games.is_public above — must re-run this grant block or client/anon reads of `games`
-- break with "permission denied for table games" (42501), which the host page then surfaces
-- as a bogus "Access Denied — invalid host token". The block is idempotent.
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
