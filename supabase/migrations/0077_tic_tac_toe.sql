CREATE TABLE IF NOT EXISTS tic_tac_toe_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  player_x_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_o_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  board jsonb NOT NULL DEFAULT '[null,null,null,null,null,null,null,null,null]',
  current_turn_mark text NOT NULL DEFAULT 'X' CHECK (current_turn_mark IN ('X', 'O')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  is_draw boolean NOT NULL DEFAULT false,
  status_message text,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tic_tac_toe_sessions_game_id ON tic_tac_toe_sessions(game_id);

ALTER TABLE tic_tac_toe_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_tic_tac_toe_sessions" on tic_tac_toe_sessions;
CREATE POLICY "public_tic_tac_toe_sessions" ON tic_tac_toe_sessions FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table tic_tac_toe_sessions; exception when duplicate_object then null; end $$;

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
VALUES ('tic_tac_toe', 2)
ON CONFLICT (game_type) DO NOTHING;
