-- Word Grouping — multiplayer Connections-style puzzle game.
-- Everyone gets the same 16 words (4 groups of 4). Race to find all groups
-- with fewest mistakes. Scoring rewards harder groups and speed.

-- Round metadata: the 16 shuffled words (no solution — that's in word_grouping_solutions).
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS word_grouping_metadata jsonb;

-- Server-only solution store (groups + categories). RLS blocks player reads.
CREATE TABLE IF NOT EXISTS word_grouping_solutions (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  solution jsonb NOT NULL
);

ALTER TABLE word_grouping_solutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "word_grouping_solutions_insert" ON word_grouping_solutions;
CREATE POLICY "word_grouping_solutions_insert" ON word_grouping_solutions FOR INSERT WITH CHECK (true);
-- No SELECT/UPDATE/DELETE policy — solution readable only by service-role API routes.

-- Per-guess submissions (correct group reveals + wrong guesses).
CREATE TABLE IF NOT EXISTS word_grouping_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  group_index integer NOT NULL,
  difficulty integer NOT NULL CHECK (difficulty BETWEEN 1 AND 4),
  guess_words jsonb NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  mistakes_at_time integer NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_grouping_subs_game ON word_grouping_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_word_grouping_subs_round ON word_grouping_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_word_grouping_subs_player ON word_grouping_submissions(player_id);

-- One correct submission per player per group.
CREATE UNIQUE INDEX IF NOT EXISTS idx_word_grouping_subs_unique_correct
  ON word_grouping_submissions(player_id, round_id, group_index) WHERE is_correct = true;

ALTER TABLE word_grouping_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "word_grouping_submissions_read" ON word_grouping_submissions;
CREATE POLICY "word_grouping_submissions_read" ON word_grouping_submissions FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table word_grouping_submissions; exception when duplicate_object then null; end $$;

-- Column-level grants (migration 0122 made grants column-level).
GRANT SELECT (id, game_id, round_id, player_id, group_index, difficulty, guess_words, is_correct, mistakes_at_time, submitted_at)
  ON word_grouping_submissions TO anon, authenticated;

GRANT SELECT (round_id, solution) ON word_grouping_solutions TO anon, authenticated;
-- RLS still blocks reads — grants alone are not enough.

GRANT SELECT (word_grouping_metadata) ON rounds TO anon, authenticated;

-- Update game_type constraints to include word_grouping.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble', 'landmine', 'ping_pong', 'uno', 'checkers_international', 'checkers_nigeria',
  'word_grouping')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('word_grouping', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent_color, sort_order, game_type, visible)
VALUES ('Word Grouping', 'word-grouping', '#f97316', 60, 'word_grouping', true)
ON CONFLICT (slug) DO NOTHING;
