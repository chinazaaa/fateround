-- Ping Pong — fast-paced 1v1 table tennis duel.
-- Discrete match state lives in ping_pong_sessions; high-frequency 60 FPS physics
-- synchronization is handled via Supabase Realtime Broadcast channels peer-to-peer.

-- ── Per-game settings ───────────────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS ping_pong_points_to_win integer NOT NULL DEFAULT 7
  CHECK (ping_pong_points_to_win IN (3, 5, 7, 11, 15, 21));

do $$
declare
  game_cols text;
  player_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  select string_agg(quote_ident(column_name), ', ')
    into player_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'players' and column_name <> 'resume_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
    execute format('revoke select on public.players from %I', role_name);
    execute format('grant select (%s) on public.players to %I', player_cols, role_name);
  end loop;
end $$;

-- ── Sessions table (one row per active/finished match) ──────────────────────────
CREATE TABLE IF NOT EXISTS ping_pong_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  player_x_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  player_o_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  score_x integer NOT NULL DEFAULT 0,
  score_o integer NOT NULL DEFAULT 0,
  points_to_win integer NOT NULL DEFAULT 7 CHECK (points_to_win IN (3, 5, 7, 11, 15, 21)),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  status_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ping_pong_sessions_game_id ON ping_pong_sessions(game_id);

ALTER TABLE ping_pong_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ping_pong_sessions_read" ON ping_pong_sessions;
CREATE POLICY "ping_pong_sessions_read" ON ping_pong_sessions FOR SELECT USING (true);

-- Writes to ping_pong_sessions go via service-role API / server functions or RPCs.
-- Grant read access to anon and authenticated roles.
GRANT SELECT ON public.ping_pong_sessions TO anon, authenticated;

-- ── Realtime publication ────────────────────────────────────────────────────────
do $$ begin alter publication supabase_realtime add table ping_pong_sessions; exception when duplicate_object then null; end $$;

-- ── Extend game-type CHECK constraints ──────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble', 'landmine', 'ping_pong')
);

-- ── Seed player limits + community leaderboard ──────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('ping_pong', 2)
ON CONFLICT (game_type) DO UPDATE SET max_players = EXCLUDED.max_players;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Ping Pong', 'ping-pong', '#10b981', 57, 'ping_pong', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ── Allow grass_court theme ───────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_theme_check;
ALTER TABLE games ADD CONSTRAINT games_theme_check CHECK (theme IN (
  'default', 'neon', 'retro', 'elegant', 'tropical', 'pirate', 'arctic', 'naija', 'grass_court'
)) NOT VALID;
ALTER TABLE games VALIDATE CONSTRAINT games_theme_check;
