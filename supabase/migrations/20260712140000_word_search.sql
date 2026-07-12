-- Word Search — real-time "race" word-search game.
-- The full letter grid + word list live in the client-readable rounds.word_search_metadata
-- JSONB (the grid IS public — that is the game). Where each word sits lives ONLY in the
-- RLS-protected word_search_solutions table (used to validate finds + power the hint).
-- Each valid find is one row in word_search_found (the live race feed). All writes happen
-- through the service-role API routes, so the tables are read-only to anon (needed for
-- realtime) and the placements are never selectable by clients.

-- ── Per-round puzzle metadata (grid + word list, NO placements) ──────────────────
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS word_search_metadata jsonb;

-- ── Per-game settings ───────────────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS word_search_theme text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS word_search_difficulty text NOT NULL DEFAULT 'medium'
  CHECK (word_search_difficulty IN ('easy', 'medium', 'hard'));
-- (time limit reuses the shared games.game_duration_seconds column, like Crossword/Sudoku)

-- ── Per-word finds (the live race feed) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS word_search_found (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  word text NOT NULL,
  start_row integer NOT NULL CHECK (start_row >= 0),
  start_col integer NOT NULL CHECK (start_col >= 0),
  end_row integer NOT NULL CHECK (end_row >= 0),
  end_col integer NOT NULL CHECK (end_col >= 0),
  via_hint boolean NOT NULL DEFAULT false,
  found_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_search_found_game_id ON word_search_found(game_id);
CREATE INDEX IF NOT EXISTS idx_word_search_found_round_id ON word_search_found(round_id);
CREATE INDEX IF NOT EXISTS idx_word_search_found_player_id ON word_search_found(player_id);

-- A player scores each word once — re-finding a word they already have is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS word_search_found_player_word_unique
  ON word_search_found (player_id, round_id, word);

ALTER TABLE word_search_found ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "word_search_found_read" ON word_search_found;
CREATE POLICY "word_search_found_read" ON word_search_found FOR SELECT USING (true);

-- ── Server-only placements (never selectable by clients) ────────────────────────
CREATE TABLE IF NOT EXISTS word_search_solutions (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  solution jsonb NOT NULL
);
ALTER TABLE word_search_solutions ENABLE ROW LEVEL SECURITY;
-- INSERT-only: the start route writes the placements once; there is deliberately NO
-- select/update/delete policy, so PostgREST denies all client reads. The placements are
-- only read by the service-role found route (which bypasses RLS).
DROP POLICY IF EXISTS "word_search_solutions_insert" ON word_search_solutions;
CREATE POLICY "word_search_solutions_insert" ON word_search_solutions FOR INSERT WITH CHECK (true);

-- ── Realtime publication ────────────────────────────────────────────────────────
do $$ begin alter publication supabase_realtime add table word_search_found; exception when duplicate_object then null; end $$;

-- ── Extend game-type CHECK constraints ──────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search')
);

-- ── Seed player limits + community leaderboard ──────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('word_search', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Word Search', 'word-search', '#8b5cf6', 54, 'word_search', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
