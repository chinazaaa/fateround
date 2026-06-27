ALTER TABLE rounds ADD COLUMN IF NOT EXISTS sudoku_metadata jsonb;

CREATE TABLE IF NOT EXISTS sudoku_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  block_index integer NOT NULL CHECK (block_index >= 0 AND block_index <= 8),
  is_correct boolean NOT NULL,
  points_awarded integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, round_id, block_index)
);

CREATE INDEX IF NOT EXISTS idx_sudoku_submissions_game_id ON sudoku_submissions(game_id);
CREATE INDEX IF NOT EXISTS idx_sudoku_submissions_round_id ON sudoku_submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_sudoku_submissions_player_id ON sudoku_submissions(player_id);

ALTER TABLE sudoku_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_sudoku_submissions" ON sudoku_submissions;
drop policy if exists "public_sudoku_submissions" on sudoku_submissions;
CREATE POLICY "public_sudoku_submissions" ON sudoku_submissions FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table sudoku_submissions; exception when duplicate_object then null; end $$;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general',
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('sudoku', 20)
ON CONFLICT (game_type) DO NOTHING;
