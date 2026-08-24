-- Troll Run fixes — make the game creatable, discoverable, and read-only from the client.
--
-- The original Troll Run migration (20261021120000_troll_run.sql) extended
-- `game_player_limits_game_type_check` but not the two constraints that gate the rows the
-- game actually writes:
--   * `games_game_type_check` — every attempt to create a Troll Run room violated it, so
--     the game could not be created at all.
--   * `app_feedback_game_type_check` — feedback submitted from a Troll Run room was
--     rejected the same way.
-- It also added three `games` columns without re-granting the column-level SELECT that
-- migration 0122 introduced (anon/authenticated hold per-column grants on `games`, so a
-- column added later is unreadable from the client), and left its own tables writable to
-- any role that is granted writes, via `FOR ALL USING (true) WITH CHECK (true)` policies.
--
-- Both CHECK constraints are recreated NOT VALID so new writes are enforced immediately
-- while the existing rows are validated in the follow-up migration, keeping this one off
-- the full-table scan path.

-- ── Game-type CHECK constraints ────────────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
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
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run'
)) NOT VALID;

-- ── Column-level grants for the Troll Run game columns ─────────────────────────
-- `troll_run_rounds`, `troll_run_time_limit` and `troll_run_world` were added after the
-- grants became column-level, so the lobby's own settings were unreadable by anon.
-- Re-running the 0122 block re-grants every non-secret column, new ones included.
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

-- ── Read-only client access to the Troll Run tables ────────────────────────────
-- Every write goes through a service-role route (Option A in docs/rls-hardening.md), so
-- the client only ever needs SELECT. The previous `FOR ALL ... WITH CHECK (true)` policies
-- would have let any role holding table writes rewrite scores directly.
ALTER TABLE troll_run_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_troll_run_sessions" ON troll_run_sessions;
CREATE POLICY "troll_run_sessions_read" ON troll_run_sessions FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.troll_run_sessions FROM anon, authenticated;
GRANT SELECT ON public.troll_run_sessions TO anon, authenticated;

ALTER TABLE troll_run_player_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_troll_run_player_states" ON troll_run_player_states;
CREATE POLICY "troll_run_player_states_read" ON troll_run_player_states FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.troll_run_player_states FROM anon, authenticated;
GRANT SELECT ON public.troll_run_player_states TO anon, authenticated;

ALTER TABLE troll_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_troll_run_events" ON troll_run_events;
CREATE POLICY "troll_run_events_read" ON troll_run_events FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.troll_run_events FROM anon, authenticated;
GRANT SELECT ON public.troll_run_events TO anon, authenticated;

-- ── Community leaderboard entry ────────────────────────────────────────────────
INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Troll Run', 'troll-run', '#f59e0b', 62, 'troll_run', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;

-- ── Round lookups ──────────────────────────────────────────────────────────────
-- Every server read of player state is scoped to one round of one game, and the round
-- scoring pass reads the whole set at once.
CREATE INDEX IF NOT EXISTS idx_troll_run_player_states_game_round
  ON troll_run_player_states(game_id, current_round);
