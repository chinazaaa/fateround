-- Quiplash — fill-in-the-blank party game with head-to-head answer battles.

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quiplash_metadata jsonb;

CREATE TABLE IF NOT EXISTS quiplash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'writing'
    CHECK (phase IN ('writing', 'voting', 'reveal', 'finished')),
  battle_index integer NOT NULL DEFAULT 0,
  active_battle_id uuid,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiplash_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_bye boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, round_id)
);

CREATE TABLE IF NOT EXISTS quiplash_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  battle_number integer NOT NULL,
  answer_a_id uuid NOT NULL REFERENCES quiplash_answers(id) ON DELETE CASCADE,
  answer_b_id uuid NOT NULL REFERENCES quiplash_answers(id) ON DELETE CASCADE,
  winner_answer_id uuid REFERENCES quiplash_answers(id),
  points_awarded integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'finished')),
  started_at timestamptz,
  ended_at timestamptz,
  UNIQUE(round_id, battle_number)
);

ALTER TABLE quiplash_sessions
  ADD CONSTRAINT quiplash_sessions_active_battle_fkey
  FOREIGN KEY (active_battle_id) REFERENCES quiplash_battles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS quiplash_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  battle_id uuid NOT NULL REFERENCES quiplash_battles(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chosen_answer_id uuid NOT NULL REFERENCES quiplash_answers(id) ON DELETE CASCADE,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, battle_id)
);

CREATE INDEX IF NOT EXISTS idx_quiplash_sessions_game_id ON quiplash_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_quiplash_answers_game_id ON quiplash_answers(game_id);
CREATE INDEX IF NOT EXISTS idx_quiplash_answers_round_id ON quiplash_answers(round_id);
CREATE INDEX IF NOT EXISTS idx_quiplash_battles_game_id ON quiplash_battles(game_id);
CREATE INDEX IF NOT EXISTS idx_quiplash_battles_round_id ON quiplash_battles(round_id);
CREATE INDEX IF NOT EXISTS idx_quiplash_votes_game_id ON quiplash_votes(game_id);
CREATE INDEX IF NOT EXISTS idx_quiplash_votes_battle_id ON quiplash_votes(battle_id);

ALTER TABLE quiplash_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quiplash_sessions" ON quiplash_sessions;
CREATE POLICY "public_quiplash_sessions" ON quiplash_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quiplash_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quiplash_answers" ON quiplash_answers;
CREATE POLICY "public_quiplash_answers" ON quiplash_answers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quiplash_battles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quiplash_battles" ON quiplash_battles;
CREATE POLICY "public_quiplash_battles" ON quiplash_battles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quiplash_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quiplash_votes" ON quiplash_votes;
CREATE POLICY "public_quiplash_votes" ON quiplash_votes FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table quiplash_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quiplash_answers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quiplash_battles; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quiplash_votes; exception when duplicate_object then null; end $$;

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
  'crazy_eights',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'checkers',
  'mahjong',
  'mafia',
  'matching_pairs',
  'quiplash'
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
  'crazy_eights',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'checkers',
  'mahjong',
  'mafia',
  'matching_pairs',
  'quiplash'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN (
    'anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
    'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on',
    'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'checkers', 'scrabble',
    'describe_it', 'snake_and_ladder', 'mahjong', 'mafia', 'matching_pairs', 'quiplash'
  )
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('quiplash', 8)
ON CONFLICT (game_type) DO UPDATE SET max_players = 8;
