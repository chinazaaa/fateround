-- Troll Run Migration: sessions, player states, events, room settings, themes, and limits

-- 1. Update games_theme_check constraint to include 'dark' and 'ping_pong'
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_theme_check;
ALTER TABLE games ADD CONSTRAINT games_theme_check CHECK (theme = ANY (ARRAY[
  'default'::text,
  'dark'::text,
  'neon'::text,
  'retro'::text,
  'elegant'::text,
  'tropical'::text,
  'pirate'::text,
  'arctic'::text,
  'naija'::text,
  'grass_court'::text,
  'ping_pong'::text
])) NOT VALID;

-- 2. Update game_player_limits_game_type_check to include 'troll_run' and 'business_empire'
ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (game_type = ANY (ARRAY[
  'anonymous_messages'::text,
  'bingo'::text,
  'codewords'::text,
  'trivia'::text,
  'two_truths'::text,
  'monopoly'::text,
  'yahtzee'::text,
  'whot'::text,
  'crazy_eights'::text,
  'ludo'::text,
  'i_call_on'::text,
  'sudoku'::text,
  'tic_tac_toe'::text,
  'word_hunt'::text,
  'chess'::text,
  'describe_it'::text,
  'scrabble'::text,
  'snake_and_ladder'::text,
  'mafia'::text,
  'matching_pairs'::text,
  'quiplash'::text,
  'word_rush'::text,
  'checkers'::text,
  'mahjong'::text,
  'quick_draw'::text,
  'ayo'::text,
  'crossword'::text,
  'word_search'::text,
  'word_scramble'::text,
  'landmine'::text,
  'ping_pong'::text,
  'uno'::text,
  'checkers_international'::text,
  'checkers_nigeria'::text,
  'word_grouping'::text,
  'wordle_room'::text,
  'troll_run'::text,
  'business_empire'::text
])) NOT VALID;

-- 3. Game room columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS troll_run_rounds integer DEFAULT 5;
ALTER TABLE games ADD COLUMN IF NOT EXISTS troll_run_time_limit integer DEFAULT 120;
ALTER TABLE games ADD COLUMN IF NOT EXISTS troll_run_world text DEFAULT 'pits';

-- 4. Sessions table
CREATE TABLE IF NOT EXISTS troll_run_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'lobby' CHECK (phase IN ('lobby', 'countdown', 'racing', 'scoreboard', 'finished')),
  current_round integer NOT NULL DEFAULT 1,
  total_rounds integer NOT NULL DEFAULT 5,
  current_world text NOT NULL DEFAULT 'pits',
  levels_per_round integer NOT NULL DEFAULT 10,
  round_time_limit integer NOT NULL DEFAULT 120,
  round_started_at timestamptz,
  turn_deadline_at timestamptz,
  level_order jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_troll_run_sessions_game_id ON troll_run_sessions(game_id);

-- 5. Player States table
CREATE TABLE IF NOT EXISTS troll_run_player_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  current_round integer NOT NULL DEFAULT 1,
  current_level_index integer NOT NULL DEFAULT 0,
  deaths integer NOT NULL DEFAULT 0,
  levels_cleared integer NOT NULL DEFAULT 0,
  total_time_ms integer NOT NULL DEFAULT 0,
  round_score integer NOT NULL DEFAULT 0,
  total_score integer NOT NULL DEFAULT 0,
  finish_position integer,
  round_finished boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id, current_round)
);

CREATE INDEX IF NOT EXISTS idx_troll_run_player_states_game_id ON troll_run_player_states(game_id);
CREATE INDEX IF NOT EXISTS idx_troll_run_player_states_player_id ON troll_run_player_states(player_id);

-- 6. Events Log (live death & clear feed)
CREATE TABLE IF NOT EXISTS troll_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round integer NOT NULL DEFAULT 1,
  level_id text NOT NULL,
  level_name text,
  event_type text NOT NULL CHECK (event_type IN ('death', 'clear')),
  time_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_troll_run_events_game_id ON troll_run_events(game_id);

-- 7. RLS Policies
ALTER TABLE troll_run_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_troll_run_sessions" ON troll_run_sessions;
CREATE POLICY "public_troll_run_sessions" ON troll_run_sessions FOR SELECT USING (true);
GRANT SELECT ON public.troll_run_sessions TO anon, authenticated;

ALTER TABLE troll_run_player_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_troll_run_player_states" ON troll_run_player_states;
CREATE POLICY "public_troll_run_player_states" ON troll_run_player_states FOR SELECT USING (true);
GRANT SELECT ON public.troll_run_player_states TO anon, authenticated;

ALTER TABLE troll_run_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_troll_run_events" ON troll_run_events;
CREATE POLICY "public_troll_run_events" ON troll_run_events FOR SELECT USING (true);
GRANT SELECT ON public.troll_run_events TO anon, authenticated;

-- 8. Realtime Publications
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE troll_run_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE troll_run_player_states; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE troll_run_events; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. Seed player limits
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('troll_run', 6)
ON CONFLICT (game_type) DO UPDATE SET max_players = 6;
