-- Checkers: International & Nigeria — shared 10x10 "flying kings" draughts engine.
-- Two separate game_type listings ('checkers_international', 'checkers_nigeria') share
-- this one table (a `variant` column distinguishes them); Nigeria adds a mirrored board
-- (a display-only concern, not stored here) and an opt-in "Street Rules" toggle.
-- Server-authoritative write model: anon may READ (realtime) but writes go through API routes.

CREATE TABLE IF NOT EXISTS checkers10_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  variant text NOT NULL CHECK (variant IN ('international', 'nigeria')),
  player_red_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_black_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- 100-char board, indexed row*10 + col. '.' empty, 'r'/'b' man, 'R'/'B' king.
  board text NOT NULL DEFAULT '.b.b.b.b.bb.b.b.b.b..b.b.b.b.bb.b.b.b.b......................r.r.r.r.rr.r.r.r.r..r.r.r.r.rr.r.r.r.r.',
  current_turn text NOT NULL DEFAULT 'b' CHECK (current_turn IN ('r', 'b')),
  -- Consecutive king-only, non-capture plies — drives the 25-move draw rule (50 plies).
  move_count integer NOT NULL DEFAULT 0,
  position_counts jsonb NOT NULL DEFAULT '{}',
  -- Square a multi-jump must continue from; NULL when no chain is active.
  must_continue_from text,
  -- Captures still required to complete the majority-rule sequence in progress.
  must_continue_remaining integer,
  -- Nigeria-only opt-in "street rules" (huffing) room setting. Off by default everywhere.
  huffing_enabled boolean NOT NULL DEFAULT false,
  -- Remaining cumulative clock per player, in ms. NULL = untimed.
  red_time_ms integer,
  black_time_ms integer,
  turn_started_at timestamptz,
  last_move_from text,
  last_move_to text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  result_reason text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  is_draw boolean NOT NULL DEFAULT false,
  status_message text,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkers10_sessions_game_id ON checkers10_sessions(game_id);

ALTER TABLE checkers10_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkers10_sessions_read" ON checkers10_sessions;
CREATE POLICY "checkers10_sessions_read" ON checkers10_sessions FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table checkers10_sessions; exception when duplicate_object then null; end $$;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
  'checkers_international', 'checkers_nigeria'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
  'checkers_international', 'checkers_nigeria'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble', 'landmine', 'ping_pong', 'uno', 'checkers_international', 'checkers_nigeria')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('checkers_international', 2), ('checkers_nigeria', 2)
ON CONFLICT (game_type) DO NOTHING;
