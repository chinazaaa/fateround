CREATE TABLE IF NOT EXISTS monopoly_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'roll' CHECK (phase IN ('roll', 'buy', 'jail', 'pay_rent', 'finished')),
  last_dice jsonb,
  consecutive_doubles integer NOT NULL DEFAULT 0,
  property_owners jsonb NOT NULL DEFAULT '{}',
  pending_space integer,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monopoly_boards_game_id ON monopoly_boards(game_id);

CREATE TABLE IF NOT EXISTS monopoly_player_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0 AND position <= 39),
  cash integer NOT NULL DEFAULT 1500,
  in_jail boolean NOT NULL DEFAULT false,
  jail_turns integer NOT NULL DEFAULT 0,
  get_out_of_jail_free integer NOT NULL DEFAULT 0,
  bankrupt boolean NOT NULL DEFAULT false,
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_monopoly_player_state_game_id ON monopoly_player_state(game_id);

ALTER TABLE monopoly_boards ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_monopoly_boards" on monopoly_boards;
CREATE POLICY "public_monopoly_boards" ON monopoly_boards FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE monopoly_player_state ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_monopoly_player_state" on monopoly_player_state;
CREATE POLICY "public_monopoly_player_state" ON monopoly_player_state FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table monopoly_boards; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table monopoly_player_state; exception when duplicate_object then null; end $$;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
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
  'monopoly'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general',
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
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
  'monopoly'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('monopoly', 6)
ON CONFLICT (game_type) DO NOTHING;
