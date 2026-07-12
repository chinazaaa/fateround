-- Word Scramble — real-time "race" unscramble game.
-- The jumbled words + theme live in the client-readable rounds.word_scramble_metadata JSONB
-- (the scrambles ARE public — that is the game). The ANSWERS live ONLY in the RLS-protected
-- word_scramble_solutions table (used to validate guesses). Each correct unscramble is one row
-- in word_scramble_solves (the live race feed). All writes go through the service-role API
-- routes, so the tables are read-only to anon (needed for realtime) and answers are never
-- selectable by clients.

-- ── Per-round puzzle metadata (scrambles + theme, NO answers) ──────────────────────
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS word_scramble_metadata jsonb;

-- ── Per-game settings ───────────────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS word_scramble_theme text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS word_scramble_difficulty text NOT NULL DEFAULT 'medium'
  CHECK (word_scramble_difficulty IN ('easy', 'medium', 'hard'));
-- (time limit reuses the shared games.game_duration_seconds column, like the other puzzles)

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN does
-- not extend them, so grant read on the two settings columns (non-secret) or GAME_SELECT errors
-- with 42501. Mirrors the crossword/word_search theme grants.
GRANT SELECT (word_scramble_theme, word_scramble_difficulty) ON public.games TO anon, authenticated;

-- ── Per-scramble solves (the live race feed) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS word_scramble_solves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  scramble_index integer NOT NULL CHECK (scramble_index >= 0),
  word text NOT NULL,
  via_hint boolean NOT NULL DEFAULT false,
  solved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_scramble_solves_game_id ON word_scramble_solves(game_id);
CREATE INDEX IF NOT EXISTS idx_word_scramble_solves_round_id ON word_scramble_solves(round_id);
CREATE INDEX IF NOT EXISTS idx_word_scramble_solves_player_id ON word_scramble_solves(player_id);

-- A player scores each scramble once — re-solving one they already have is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS word_scramble_solves_player_index_unique
  ON word_scramble_solves (player_id, round_id, scramble_index);

ALTER TABLE word_scramble_solves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "word_scramble_solves_read" ON word_scramble_solves;
CREATE POLICY "word_scramble_solves_read" ON word_scramble_solves FOR SELECT USING (true);

-- ── Server-only answers (never selectable by clients) ────────────────────────────
CREATE TABLE IF NOT EXISTS word_scramble_solutions (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  solution jsonb NOT NULL
);
ALTER TABLE word_scramble_solutions ENABLE ROW LEVEL SECURITY;
-- INSERT-only: the start route writes the answers once; there is deliberately NO
-- select/update/delete policy, so PostgREST denies all client reads.
DROP POLICY IF EXISTS "word_scramble_solutions_insert" ON word_scramble_solutions;
CREATE POLICY "word_scramble_solutions_insert" ON word_scramble_solutions FOR INSERT WITH CHECK (true);

-- ── Realtime publication ────────────────────────────────────────────────────────
do $$ begin alter publication supabase_realtime add table word_scramble_solves; exception when duplicate_object then null; end $$;

-- ── Extend game-type CHECK constraints ──────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble')
);

-- ── Community library: allow word_scramble word packs ────────────────────────────
alter table question_packs drop constraint if exists question_packs_game_type_check;
alter table question_packs add constraint question_packs_game_type_check
  check (game_type in (
    'trivia', 'would_you_rather', 'most_likely_to', 'this_or_that', 'never_have_i_ever',
    'describe_it', 'quick_draw', 'codewords', 'pick_a_number', 'crossword', 'word_search',
    'word_scramble'
  ));

-- ── Seed player limits + community leaderboard ──────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('word_scramble', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Word Scramble', 'word-scramble', '#f59e0b', 55, 'word_scramble', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
