CREATE TABLE IF NOT EXISTS snake_ladder_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'roll' CHECK (phase IN ('roll', 'finished')),
  last_roll integer CHECK (last_roll IS NULL OR (last_roll >= 1 AND last_roll <= 6)),
  last_from integer CHECK (last_from IS NULL OR (last_from >= 0 AND last_from <= 100)),
  last_to integer CHECK (last_to IS NULL OR (last_to >= 0 AND last_to <= 100)),
  last_event text CHECK (last_event IS NULL OR last_event IN ('start', 'move', 'ladder', 'snake', 'overshoot', 'bust', 'win')),
  last_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  consecutive_sixes integer NOT NULL DEFAULT 0,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_snake_ladder_sessions_game_id ON snake_ladder_sessions(game_id);

CREATE TABLE IF NOT EXISTS snake_ladder_player_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('red', 'blue', 'green', 'yellow', 'purple', 'orange')),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 100),
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_snake_ladder_player_state_game_id ON snake_ladder_player_state(game_id);

ALTER TABLE snake_ladder_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_snake_ladder_sessions" on snake_ladder_sessions;
CREATE POLICY "public_snake_ladder_sessions" ON snake_ladder_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE snake_ladder_player_state ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_snake_ladder_player_state" on snake_ladder_player_state;
CREATE POLICY "public_snake_ladder_player_state" ON snake_ladder_player_state FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table snake_ladder_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table snake_ladder_player_state; exception when duplicate_object then null; end $$;

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
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder'
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
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('snake_and_ladder', 4)
ON CONFLICT (game_type) DO NOTHING;
