-- Scrabble: a 2–4 player word game on a 15x15 board. One session row holds the
-- shared board, tile bag, and turn order; each player has a private rack + score.

CREATE TABLE IF NOT EXISTS scrabble_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  board jsonb NOT NULL DEFAULT '[]',
  bag jsonb NOT NULL DEFAULT '[]',
  phase text NOT NULL DEFAULT 'playing' CHECK (phase IN ('playing', 'finished')),
  consecutive_passes integer NOT NULL DEFAULT 0,
  last_move jsonb,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  is_tie boolean NOT NULL DEFAULT false,
  status_message text,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scrabble_sessions_game_id ON scrabble_sessions(game_id);

ALTER TABLE scrabble_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_scrabble_sessions" on scrabble_sessions;
CREATE POLICY "public_scrabble_sessions" ON scrabble_sessions FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table scrabble_sessions; exception when duplicate_object then null; end $$;

CREATE TABLE IF NOT EXISTS scrabble_player_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rack jsonb NOT NULL DEFAULT '[]',
  score integer NOT NULL DEFAULT 0,
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

ALTER TABLE scrabble_player_state ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_scrabble_player_state" on scrabble_player_state;
CREATE POLICY "public_scrabble_player_state" ON scrabble_player_state FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table scrabble_player_state; exception when duplicate_object then null; end $$;

-- These DROP/ADD the game_type checks, so the list must include EVERY existing
-- game type (not just scrabble) or it would silently disallow the others.
-- 'describe_it' was added on main in parallel — keep it here too.
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
  'scrabble'
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
  'scrabble'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('scrabble', 4)
ON CONFLICT (game_type) DO NOTHING;
