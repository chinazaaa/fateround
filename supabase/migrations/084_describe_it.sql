-- Describe It: team-based word game. Each round, one team is on the clock; a
-- describer types clues for secret words and teammates type guesses. Correct
-- guesses score a point and reveal the next word. Most words across all rounds wins.

-- How many teams the host configured (2-4). Turn length uses games.timer_seconds,
-- and the number of rounds uses games.rounds_count.
ALTER TABLE games ADD COLUMN IF NOT EXISTS describe_it_num_teams integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS describe_it_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  num_teams integer NOT NULL,
  total_rounds integer NOT NULL,
  turn_seconds integer NOT NULL,
  -- 'turn' = a team is actively playing; 'break' = short gap between turns; 'finished'.
  phase text NOT NULL DEFAULT 'turn' CHECK (phase IN ('turn', 'break', 'finished')),
  -- 0-based index into the full turn order (num_teams * total_rounds turns total).
  turn_index integer NOT NULL DEFAULT 0,
  current_round integer NOT NULL DEFAULT 1,
  active_team integer NOT NULL DEFAULT 1,
  describer_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  current_word text,
  current_clue text,
  used_words text[] NOT NULL DEFAULT '{}',
  turn_deadline_at timestamptz,
  break_deadline_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  status_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS describe_it_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

-- One row per word the describer presented: scoring + history.
CREATE TABLE IF NOT EXISTS describe_it_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  round integer NOT NULL,
  team integer NOT NULL,
  describer_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  word text NOT NULL,
  clue text,
  status text NOT NULL CHECK (status IN ('guessed', 'skipped')),
  guesser_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Live guess feed during a turn.
CREATE TABLE IF NOT EXISTS describe_it_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team integer NOT NULL,
  text text NOT NULL,
  correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_describe_it_sessions_game_id ON describe_it_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_describe_it_players_game_id ON describe_it_players(game_id);
CREATE INDEX IF NOT EXISTS idx_describe_it_words_game_id ON describe_it_words(game_id);
CREATE INDEX IF NOT EXISTS idx_describe_it_guesses_game_id ON describe_it_guesses(game_id);

ALTER TABLE describe_it_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE describe_it_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE describe_it_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE describe_it_guesses ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_describe_it_sessions" on describe_it_sessions;
CREATE POLICY "public_describe_it_sessions" ON describe_it_sessions FOR ALL USING (true) WITH CHECK (true);
drop policy if exists "public_describe_it_players" on describe_it_players;
CREATE POLICY "public_describe_it_players" ON describe_it_players FOR ALL USING (true) WITH CHECK (true);
drop policy if exists "public_describe_it_words" on describe_it_words;
CREATE POLICY "public_describe_it_words" ON describe_it_words FOR ALL USING (true) WITH CHECK (true);
drop policy if exists "public_describe_it_guesses" on describe_it_guesses;
CREATE POLICY "public_describe_it_guesses" ON describe_it_guesses FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table describe_it_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table describe_it_players; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table describe_it_words; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table describe_it_guesses; exception when duplicate_object then null; end $$;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that',
  'most_likely_to', 'who_said_this', 'hot_seat', 'custom', 'anonymous_messages',
  'secret_message', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly',
  'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt',
  'chess', 'describe_it'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that',
  'most_likely_to', 'who_said_this', 'hot_seat', 'custom', 'anonymous_messages',
  'secret_message', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly',
  'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt',
  'chess', 'describe_it'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('describe_it', 20)
ON CONFLICT (game_type) DO NOTHING;
