-- UNO — colour/number/symbol shedding game (cousin of Crazy Eights / Whot).
-- Server-authoritative write model: anon may READ (realtime needs it) but every
-- write goes through a service-role API route. So these tables ship with the
-- locked-down read-only RLS policy from the start (see 0109_rls_lockdown_whot.sql).

CREATE TABLE IF NOT EXISTS uno_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  -- Direction of play: 1 = forward through turn_order, -1 = reversed (Reverse card).
  direction smallint NOT NULL DEFAULT 1 CHECK (direction IN (1, -1)),
  phase text NOT NULL DEFAULT 'playing'
    CHECK (phase IN ('playing', 'choose_color', 'challenge_window', 'finished')),
  draw_pile jsonb NOT NULL DEFAULT '[]',
  discard_pile jsonb NOT NULL DEFAULT '[]',
  top_card jsonb,
  -- Colour demanded by a Wild / Wild Draw Four. NULL when the top card stands on its own.
  required_color text CHECK (required_color IS NULL OR required_color IN ('red', 'yellow', 'green', 'blue')),
  -- Pending forced draw the current player must take (Draw Two / Draw Four target).
  draw_penalty integer NOT NULL DEFAULT 0,
  -- During `choose_color`, which wild is being coloured ('wild' | 'wild_draw4').
  pending_wild text CHECK (pending_wild IS NULL OR pending_wild IN ('wild', 'wild_draw4')),
  -- Colour in effect immediately BEFORE a Wild Draw Four was played (for challenge reveal).
  challenge_prev_color text
    CHECK (challenge_prev_color IS NULL OR challenge_prev_color IN ('red', 'yellow', 'green', 'blue')),
  -- Who played the Wild Draw Four currently sitting in `challenge_window`.
  wd4_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  -- Player who dropped to one card and still owes an "UNO" call (penalty on their next-turn miss).
  uno_pending_player uuid REFERENCES players(id) ON DELETE SET NULL,
  -- Whether `uno_pending_player` has satisfied their UNO call.
  uno_called boolean NOT NULL DEFAULT false,
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  -- Player ids in the order they emptied their hands. Drives final placement.
  finish_order uuid[] NOT NULL DEFAULT '{}',
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uno_sessions_game_id ON uno_sessions(game_id);

CREATE TABLE IF NOT EXISTS uno_player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cards jsonb NOT NULL DEFAULT '[]',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_uno_player_hands_game_id ON uno_player_hands(game_id);

ALTER TABLE uno_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "uno_sessions_read" on uno_sessions;
CREATE POLICY "uno_sessions_read" ON uno_sessions FOR SELECT USING (true);

ALTER TABLE uno_player_hands ENABLE ROW LEVEL SECURITY;
drop policy if exists "uno_player_hands_read" on uno_player_hands;
CREATE POLICY "uno_player_hands_read" ON uno_player_hands FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table uno_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table uno_player_hands; exception when duplicate_object then null; end $$;

-- ── Per-game host rules ─────────────────────────────────────────────────────────
-- Classic UNO wires only wd4_challenge (default on) and uno_penalty (default 2).
-- zero_seven / stacking / multi_play columns ship now so the follow-up toggle pass
-- needs no second migration.
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_wd4_challenge boolean NOT NULL DEFAULT true;
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_uno_penalty integer NOT NULL DEFAULT 2
  CHECK (uno_uno_penalty IN (2, 4));
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_wd4_challenge_penalty integer NOT NULL DEFAULT 4
  CHECK (uno_wd4_challenge_penalty IN (4, 6));
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_zero_seven boolean NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_stacking boolean NOT NULL DEFAULT false;
ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_multi_play boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN games.uno_wd4_challenge IS 'UNO: allow challenging a Wild Draw Four (default on).';
COMMENT ON COLUMN games.uno_uno_penalty IS 'UNO: cards drawn for a missed "UNO" call (2 or 4).';
COMMENT ON COLUMN games.uno_wd4_challenge_penalty IS 'UNO: cards a failed challenger draws (4 base, 6 variant).';
COMMENT ON COLUMN games.uno_zero_seven IS 'UNO: 0 = rotate all hands, 7 = swap hands (deferred toggle).';
COMMENT ON COLUMN games.uno_stacking IS 'UNO: allow stacking Draw Two on Draw Two / Draw Four on Draw Four (deferred toggle).';
COMMENT ON COLUMN games.uno_multi_play IS 'UNO: allow laying multiple same-colour cards in one turn (deferred toggle).';

-- Grant anon/authenticated SELECT on the new games columns (0122 made grants column-level;
-- ADD COLUMN does not extend them — non-secret game config, safe to expose).
GRANT SELECT (
  uno_wd4_challenge, uno_uno_penalty, uno_wd4_challenge_penalty, uno_zero_seven, uno_stacking, uno_multi_play
) ON public.games TO anon, authenticated;

-- ── Extend game-type CHECK constraints ──────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno'
)) NOT VALID;

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno'
)) NOT VALID;

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble', 'landmine', 'ping_pong', 'uno')
) NOT VALID;

-- ── Seed player limits + community leaderboard ──────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('uno', 10)
ON CONFLICT (game_type) DO UPDATE SET max_players = EXCLUDED.max_players;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('UNO', 'uno', '#ef4444', 58, 'uno', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
