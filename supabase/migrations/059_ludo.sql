CREATE TABLE IF NOT EXISTS ludo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'roll' CHECK (phase IN ('roll', 'move', 'finished')),
  last_dice integer CHECK (last_dice IS NULL OR (last_dice >= 1 AND last_dice <= 6)),
  consecutive_sixes integer NOT NULL DEFAULT 0,
  extra_turn boolean NOT NULL DEFAULT false,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ludo_sessions_game_id ON ludo_sessions(game_id);

CREATE TABLE IF NOT EXISTS ludo_player_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('red', 'green', 'yellow', 'blue')),
  pieces jsonb NOT NULL DEFAULT '[]',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_ludo_player_state_game_id ON ludo_player_state(game_id);

ALTER TABLE ludo_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_ludo_sessions" on ludo_sessions;
CREATE POLICY "public_ludo_sessions" ON ludo_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE ludo_player_state ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_ludo_player_state" on ludo_player_state;
CREATE POLICY "public_ludo_player_state" ON ludo_player_state FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table ludo_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table ludo_player_state; exception when duplicate_object then null; end $$;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
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
  'ludo'
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
  'ludo'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('ludo', 4)
ON CONFLICT (game_type) DO NOTHING;
