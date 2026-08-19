-- Remove Ping Pong from database — superseded by Troll Run.
--
-- Drops ping_pong_sessions table, removes ping_pong_points_to_win from games table,
-- cleans up game_player_limits, system_trophies, community_games, and removes
-- ping_pong from games_game_type_check and app_feedback_game_type_check constraints.

-- 1. Realtime & Table Cleanup
do $$ begin
  alter publication supabase_realtime drop table ping_pong_sessions;
exception when undefined_object then null;
end $$;

DROP TABLE IF EXISTS ping_pong_sessions CASCADE;

-- 2. Column Removal
ALTER TABLE games DROP COLUMN IF EXISTS ping_pong_points_to_win;

-- 3. Game limits, trophies & community cleanup
DELETE FROM game_player_limits WHERE game_type = 'ping_pong';
DELETE FROM system_trophies WHERE category = 'ping_pong' OR game_type = 'ping_pong';
DELETE FROM community_games WHERE game_type = 'ping_pong' OR slug = 'ping-pong';

-- 4. Game-type CHECK constraints
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run'
)) NOT VALID;

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run'
)) NOT VALID;

-- 5. Re-grant column-level select for games table
do $$
declare
  game_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
  end loop;
end $$;
