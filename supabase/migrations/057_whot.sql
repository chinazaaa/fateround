CREATE TABLE IF NOT EXISTS whot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'playing' CHECK (phase IN ('playing', 'choose_whot', 'finished')),
  draw_pile jsonb NOT NULL DEFAULT '[]',
  top_card jsonb,
  required_shape text CHECK (required_shape IS NULL OR required_shape IN ('circle', 'cross', 'triangle', 'square', 'star', 'whot')),
  required_number integer CHECK (required_number IS NULL OR (required_number >= 1 AND required_number <= 14)),
  pick_two_stack integer NOT NULL DEFAULT 0,
  pick_five_stack integer NOT NULL DEFAULT 0,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whot_sessions_game_id ON whot_sessions(game_id);

CREATE TABLE IF NOT EXISTS whot_player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cards jsonb NOT NULL DEFAULT '[]',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_whot_player_hands_game_id ON whot_player_hands(game_id);

ALTER TABLE whot_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_whot_sessions" on whot_sessions;
CREATE POLICY "public_whot_sessions" ON whot_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE whot_player_hands ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_whot_player_hands" on whot_player_hands;
CREATE POLICY "public_whot_player_hands" ON whot_player_hands FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table whot_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table whot_player_hands; exception when duplicate_object then null; end $$;

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
  'whot'
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
  'whot'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('whot', 6)
ON CONFLICT (game_type) DO NOTHING;
