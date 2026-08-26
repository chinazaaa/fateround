-- Go Fish — classic "ask an opponent for a rank" card game on a standard 52-card deck.
--
-- Timestamp bumped past 20261104120000_rummy.sql so this file is the LAST word on
-- games_game_type_check / app_feedback_game_type_check / game_player_limits_game_type_check.
-- Both games' original migrations shared the 20261104120000 timestamp, and whichever ran
-- last would drop the other from the enum. All three lists below name rummy alongside
-- gofish so nothing is silently dropped.
--
-- Server-authoritative writes only: anon may READ (realtime needs it) but every mutation
-- goes through a service-role API route. Hands ship read-only-to-anon like the other card
-- games; the `cards` column will be redacted through the same hand-redaction primitive
-- (src/lib/hand-redaction.ts) once its route is wired, so opponents only ever see a count.
-- Books are public information — laid out in front of the player like the physical game.

CREATE TABLE IF NOT EXISTS gofish_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'playing' CHECK (phase IN ('playing', 'finished')),
  -- Face-down draw pile. Server-only source of truth; redacted from client responses so
  -- players can't see the order of upcoming cards. `ocean_count` mirrors its length and
  -- IS public — everyone at the table can see how many cards are left in the ocean.
  ocean jsonb NOT NULL DEFAULT '[]',
  ocean_count integer NOT NULL DEFAULT 0,
  -- Append-only public event log ({kind, from_id, target_id, rank, count, ...}).
  event_log jsonb NOT NULL DEFAULT '[]',
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  -- Player ids in the order they exhausted their hand+ocean (drive final placement).
  finish_order uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gofish_sessions_game_id ON gofish_sessions(game_id);

CREATE TABLE IF NOT EXISTS gofish_player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Private hand. Redacted for anyone but the owning viewer (see hand-redaction.ts).
  cards jsonb NOT NULL DEFAULT '[]',
  -- Completed books, as an array of ranks (1..13). Public information — laid face-up in
  -- front of the player, like the physical game.
  books smallint[] NOT NULL DEFAULT '{}',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id),
  CONSTRAINT gofish_books_valid CHECK (
    books <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13]::smallint[]
  )
);

CREATE INDEX IF NOT EXISTS idx_gofish_player_hands_game_id ON gofish_player_hands(game_id);
CREATE INDEX IF NOT EXISTS idx_gofish_player_hands_player_id ON gofish_player_hands(player_id);

-- Read-only-to-anon RLS (same posture as whot/crazy_eights/uno; writes are service-role).
ALTER TABLE gofish_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gofish_sessions_read" ON gofish_sessions;
CREATE POLICY "gofish_sessions_read" ON gofish_sessions FOR SELECT USING (true);

ALTER TABLE gofish_player_hands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gofish_player_hands_read" ON gofish_player_hands;
CREATE POLICY "gofish_player_hands_read" ON gofish_player_hands FOR SELECT USING (true);

do $$ begin
  alter publication supabase_realtime add table gofish_sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table gofish_player_hands;
exception when duplicate_object then null; end $$;

-- Register the game type in the enum-shaped CHECK constraints.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'rummy', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run',
  'gofish'
)) NOT VALID;

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'rummy', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run',
  'gofish'
)) NOT VALID;

-- Player limits: 2..6.
ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
-- The enum here has drifted historically (crazy_eights added, then never re-listed in every
-- successor migration). Rewrite it to the full LOBBY_LIMIT_GAME_TYPES set so no valid row
-- can be blocked by a stale check.
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN (
    'anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee',
    'whot', 'rummy', 'crazy_eights', 'uno', 'ludo', 'mahjong', 'i_call_on', 'sudoku', 'tic_tac_toe',
    'word_hunt', 'chess', 'checkers', 'checkers_international', 'checkers_nigeria', 'scrabble',
    'describe_it', 'snake_and_ladder', 'mafia', 'matching_pairs', 'quiplash', 'quick_draw',
    'word_rush', 'ayo', 'crossword', 'word_search', 'word_scramble', 'word_grouping',
    'landmine', 'wordle_room', 'troll_run', 'gofish'
  )
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('gofish', 6)
ON CONFLICT (game_type) DO NOTHING;

-- Community leaderboard registration. sort_order continues the sequence (highest
-- before this: 70, Rummy — see 20261104120000_rummy.sql).
INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Go Fish', 'go-fish', '#0ea5e9', 71, 'gofish', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
