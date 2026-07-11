-- Ayo (Ayo Olopon) — Yoruba mancala-style seed game for 2 players.
-- Server-authoritative write model: anon may READ (realtime) but writes go through API routes.

CREATE TABLE IF NOT EXISTS ayo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  player_a_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_b_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- 12 pits, indices 0–5 = side A (bottom), 6–11 = side B (top). Anti-clockwise sowing.
  pits jsonb NOT NULL DEFAULT '[4,4,4,4,4,4,4,4,4,4,4,4]'::jsonb,
  captured_a integer NOT NULL DEFAULT 0,
  captured_b integer NOT NULL DEFAULT 0,
  current_turn text NOT NULL DEFAULT 'a' CHECK (current_turn IN ('a', 'b')),
  a_win_streak integer NOT NULL DEFAULT 0,
  b_win_streak integer NOT NULL DEFAULT 0,
  a_time_ms integer,
  b_time_ms integer,
  turn_started_at timestamptz,
  last_pit integer,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  result_reason text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  is_draw boolean NOT NULL DEFAULT false,
  status_message text,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ayo_sessions_game_id ON ayo_sessions(game_id);

ALTER TABLE ayo_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ayo_sessions_read" ON ayo_sessions;
CREATE POLICY "ayo_sessions_read" ON ayo_sessions FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table ayo_sessions; exception when duplicate_object then null; end $$;

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
  'word_rush',
  'quick_draw',
  'ayo'
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
  'word_rush',
  'quick_draw',
  'ayo'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('ayo', 2)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Ayo', 'ayo', '#b45309', 52, 'ayo', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
