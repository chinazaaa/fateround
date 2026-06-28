-- Crazy Eights — standard-deck shedding game (cousin of Whot).
-- Server-authoritative write model: anon may READ (realtime needs it) but every
-- write goes through a service-role API route. So these tables ship with the
-- locked-down read-only RLS policy from the start (see 0109_rls_lockdown_whot.sql).

CREATE TABLE IF NOT EXISTS crazy_eights_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  -- Direction of play: 1 = forward through turn_order, -1 = reversed (Queen).
  direction smallint NOT NULL DEFAULT 1 CHECK (direction IN (1, -1)),
  phase text NOT NULL DEFAULT 'playing' CHECK (phase IN ('playing', 'choose_suit', 'finished')),
  draw_pile jsonb NOT NULL DEFAULT '[]',
  discard_pile jsonb NOT NULL DEFAULT '[]',
  top_card jsonb,
  -- Suit demanded by a wild (8 / Joker). NULL when the top card stands on its own.
  required_suit text CHECK (required_suit IS NULL OR required_suit IN ('spades', 'clubs', 'hearts', 'diamonds')),
  -- Stackable, defendable-with-a-2 penalty (Pick Two).
  pick_two_stack integer NOT NULL DEFAULT 0,
  -- Non-defendable forced draw (5) left by a Joker (the next player just draws it).
  joker_penalty integer NOT NULL DEFAULT 0,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crazy_eights_sessions_game_id ON crazy_eights_sessions(game_id);

CREATE TABLE IF NOT EXISTS crazy_eights_player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cards jsonb NOT NULL DEFAULT '[]',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_crazy_eights_player_hands_game_id ON crazy_eights_player_hands(game_id);

ALTER TABLE crazy_eights_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "crazy_eights_sessions_read" on crazy_eights_sessions;
CREATE POLICY "crazy_eights_sessions_read" ON crazy_eights_sessions FOR SELECT USING (true);

ALTER TABLE crazy_eights_player_hands ENABLE ROW LEVEL SECURITY;
drop policy if exists "crazy_eights_player_hands_read" on crazy_eights_player_hands;
CREATE POLICY "crazy_eights_player_hands_read" ON crazy_eights_player_hands FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table crazy_eights_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table crazy_eights_player_hands; exception when duplicate_object then null; end $$;

-- Per-game host rules.
ALTER TABLE games ADD COLUMN IF NOT EXISTS crazy8_action_cards boolean NOT NULL DEFAULT true;
ALTER TABLE games ADD COLUMN IF NOT EXISTS crazy8_jokers boolean NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS crazy8_pick2_stacking boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN games.crazy8_action_cards IS 'Crazy Eights: enable 2/J/Q/A action cards (off = only the 8 is wild).';
COMMENT ON COLUMN games.crazy8_jokers IS 'Crazy Eights: include 2 Jokers (wild + draw 5) in the deck.';
COMMENT ON COLUMN games.crazy8_pick2_stacking IS 'Crazy Eights: allow stacking/defending a Pick Two (2) instead of forcing the draw.';

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
  'crazy_eights'
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
  'crazy_eights'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'crazy_eights')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('crazy_eights', 6)
ON CONFLICT (game_type) DO NOTHING;
