-- Checkers — American 8×8 draughts, a 2-player game (cousin of Chess).
-- Server-authoritative write model: anon may READ (realtime needs it) but every
-- write goes through a service-role API route, so this table ships with the
-- locked-down read-only RLS policy from the start (see 0111_rls_lockdown_chess.sql).
-- One row per game holds the board, whose turn it is, and each player's clock.

CREATE TABLE IF NOT EXISTS checkers_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  player_red_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_black_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- 64-char board, indexed row*8 + col. '.' empty, 'r'/'b' man, 'R'/'B' king.
  board text NOT NULL DEFAULT '.b.b.b.bb.b.b.b..b.b.b.b................r.r.r.r..r.r.r.rr.r.r.r.',
  current_turn text NOT NULL DEFAULT 'r' CHECK (current_turn IN ('r', 'b')),
  -- Consecutive king-only, non-capture plies — drives the 40-move draw rule.
  move_count integer NOT NULL DEFAULT 0,
  -- Square a multi-jump must continue from; NULL when no chain is active.
  must_continue_from text,
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

CREATE INDEX IF NOT EXISTS idx_checkers_sessions_game_id ON checkers_sessions(game_id);

ALTER TABLE checkers_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "checkers_sessions_read" on checkers_sessions;
CREATE POLICY "checkers_sessions_read" ON checkers_sessions FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table checkers_sessions; exception when duplicate_object then null; end $$;

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
  'scrabble',
  'snake_and_ladder',
  'crazy_eights',
  'checkers'
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
  'scrabble',
  'snake_and_ladder',
  'crazy_eights',
  'checkers'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'crazy_eights', 'checkers')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('checkers', 2)
ON CONFLICT (game_type) DO NOTHING;
