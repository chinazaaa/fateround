CREATE TABLE IF NOT EXISTS yahtzee_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'rolling' CHECK (phase IN ('rolling', 'finished')),
  dice integer[] NOT NULL DEFAULT '{1,1,1,1,1}',
  held boolean[] NOT NULL DEFAULT '{false,false,false,false,false}',
  rolls_remaining integer NOT NULL DEFAULT 3,
  rolls_this_turn integer NOT NULL DEFAULT 0,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yahtzee_sessions_game_id ON yahtzee_sessions(game_id);

CREATE TABLE IF NOT EXISTS yahtzee_player_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  scores jsonb NOT NULL DEFAULT '{}',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_yahtzee_player_scores_game_id ON yahtzee_player_scores(game_id);

ALTER TABLE yahtzee_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_yahtzee_sessions" on yahtzee_sessions;
CREATE POLICY "public_yahtzee_sessions" ON yahtzee_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE yahtzee_player_scores ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_yahtzee_player_scores" on yahtzee_player_scores;
CREATE POLICY "public_yahtzee_player_scores" ON yahtzee_player_scores FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table yahtzee_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table yahtzee_player_scores; exception when duplicate_object then null; end $$;

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
  'monopoly',
  'yahtzee'
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
  'monopoly',
  'yahtzee'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('yahtzee', 6)
ON CONFLICT (game_type) DO NOTHING;
