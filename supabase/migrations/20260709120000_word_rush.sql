-- Word Rush: race to name words that start and end with given letters.

ALTER TABLE games ADD COLUMN IF NOT EXISTS word_rush_mode text NOT NULL DEFAULT 'team'
  CHECK (word_rush_mode IN ('team', 'individual'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS word_rush_prompt_mode text NOT NULL DEFAULT 'automatic'
  CHECK (word_rush_prompt_mode IN ('automatic', 'manual'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS word_rush_num_teams integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS word_rush_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('team', 'individual')),
  prompt_mode text NOT NULL CHECK (prompt_mode IN ('automatic', 'manual')),
  num_teams integer NOT NULL,
  total_rounds integer NOT NULL,
  turn_seconds integer NOT NULL,
  phase text NOT NULL DEFAULT 'playing'
    CHECK (phase IN ('playing', 'awaiting_prompt', 'intermission', 'finished')),
  turn_index integer NOT NULL DEFAULT 0,
  current_round integer NOT NULL DEFAULT 1,
  active_team integer NOT NULL DEFAULT 1,
  prompt_setter_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  roster uuid[] NOT NULL DEFAULT '{}',
  start_letter text,
  end_letter text,
  prompt_index integer NOT NULL DEFAULT 0,
  used_pairs text[] NOT NULL DEFAULT '{}',
  turn_deadline_at timestamptz,
  intermission_deadline_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  status_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS word_rush_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team integer NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS word_rush_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  round integer NOT NULL,
  team integer NOT NULL,
  team_turn_index integer,
  prompt_index integer NOT NULL,
  start_letter text NOT NULL,
  end_letter text NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  text text NOT NULL,
  correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_rush_sessions_game_id ON word_rush_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_word_rush_players_game_id ON word_rush_players(game_id);
CREATE INDEX IF NOT EXISTS idx_word_rush_answers_game_id ON word_rush_answers(game_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_word_rush_answers_individual_once
  ON word_rush_answers(game_id, turn_index, player_id);

ALTER TABLE word_rush_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_word_rush_sessions" ON word_rush_sessions;
CREATE POLICY "public_word_rush_sessions" ON word_rush_sessions FOR SELECT USING (true);

ALTER TABLE word_rush_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_word_rush_players" ON word_rush_players;
CREATE POLICY "public_word_rush_players" ON word_rush_players FOR SELECT USING (true);

ALTER TABLE word_rush_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_word_rush_answers" ON word_rush_answers;
CREATE POLICY "public_word_rush_answers" ON word_rush_answers FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table word_rush_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table word_rush_players; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table word_rush_answers; exception when duplicate_object then null; end $$;

CREATE OR REPLACE FUNCTION word_rush_add_score(p_game_id text, p_player_id uuid, p_delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE word_rush_players
  SET score = score + p_delta
  WHERE game_id = p_game_id AND player_id = p_player_id;
END;
$$;

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
  'quiplash',
  'word_rush'
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
  'quiplash',
  'word_rush'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('word_rush', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Word Rush', 'word-rush', '#f97316', 50, 'word_rush', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
