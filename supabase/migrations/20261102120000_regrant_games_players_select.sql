-- Re-grant column-level SELECT on games/players to the public roles.
--
-- Same pattern as 20261006120000_regrant_games_players_select.sql. Since that
-- ran, several migrations have added new columns to `games` (and one to
-- `players`) that PostgREST now refuses to select for anon/authenticated,
-- which the host page surfaces as the misleading
-- "Can't reach the server / database is slow" load-error state.
--
-- Columns added since the last regrant include (non-exhaustive):
--   games.wordle_room_category, wordle_room_word_count, wordle_room_custom_words
--   games.host_user_id
--   games.troll_run_rounds, troll_run_time_limit, troll_run_world
--   games.monopoly_loans_enabled, monopoly_loan_interest, monopoly_loan_term_rounds
--   games.edition_slug
--   players.user_id
--
-- Idempotent — safe on every environment. Regenerates the grant from the
-- live column list so any future gaps are also closed.

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

notify pgrst, 'reload schema';
