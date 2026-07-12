-- Crossword — real-time "race" crossword game.
-- Mirrors the Sudoku model: the puzzle layout + clues live in the client-readable
-- rounds.crossword_metadata JSONB; the answer letters live ONLY in the RLS-protected
-- crossword_solutions table; per-cell letter guesses go in crossword_submissions.
-- All writes happen through the service-role API routes, so the tables are read-only
-- to anon (needed for realtime) and the solution is never selectable by clients.

-- ── Per-round puzzle metadata (layout + clues, NO letters) ──────────────────────
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS crossword_metadata jsonb;

-- ── Per-game settings ───────────────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS crossword_theme text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS crossword_difficulty text NOT NULL DEFAULT 'medium'
  CHECK (crossword_difficulty IN ('easy', 'medium', 'hard'));
-- (time limit reuses the shared games.game_duration_seconds column, like Sudoku)

-- ── Per-cell letter submissions (the live race feed) ────────────────────────────
CREATE TABLE IF NOT EXISTS crossword_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cell_row integer NOT NULL CHECK (cell_row >= 0),
  cell_col integer NOT NULL CHECK (cell_col >= 0),
  submitted_letter text NOT NULL CHECK (char_length(submitted_letter) = 1),
  is_correct boolean NOT NULL,
  via_hint boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crossword_submissions_game_id ON crossword_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_crossword_submissions_round_id ON crossword_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_crossword_submissions_player_id ON crossword_submissions(player_id);

-- One correct letter per (player, round, cell) — re-solving a cell is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS crossword_submissions_player_cell_correct_unique
  ON crossword_submissions (player_id, round_id, cell_row, cell_col)
  WHERE is_correct = true;

ALTER TABLE crossword_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crossword_submissions_read" ON crossword_submissions;
CREATE POLICY "crossword_submissions_read" ON crossword_submissions FOR SELECT USING (true);

-- ── Server-only solution grid (never selectable by clients) ─────────────────────
CREATE TABLE IF NOT EXISTS crossword_solutions (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  solution jsonb NOT NULL
);
ALTER TABLE crossword_solutions ENABLE ROW LEVEL SECURITY;
-- INSERT-only: the start route writes the solution once; there is deliberately NO
-- select/update/delete policy, so PostgREST denies all client reads. The solution is
-- only read by the service-role submit route (which bypasses RLS).
DROP POLICY IF EXISTS "crossword_solutions_insert" ON crossword_solutions;
CREATE POLICY "crossword_solutions_insert" ON crossword_solutions FOR INSERT WITH CHECK (true);

-- ── Realtime publication ────────────────────────────────────────────────────────
do $$ begin alter publication supabase_realtime add table crossword_submissions; exception when duplicate_object then null; end $$;

-- ── Extend game-type CHECK constraints ──────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword')
);

-- ── Seed player limits + community leaderboard ──────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('crossword', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Crossword', 'crossword', '#0ea5e9', 53, 'crossword', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
