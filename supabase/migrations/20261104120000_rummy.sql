-- Rummy — classic draw-and-discard card game. Server-authoritative write model
-- (anon may READ for realtime, writes go through service-role API routes) — so the
-- tables ship with the read-only-anon RLS shape from the start.

CREATE TABLE IF NOT EXISTS rummy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  turn_order uuid[] NOT NULL DEFAULT '{}',
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'playing' CHECK (phase IN ('playing', 'finished')),
  draw_pile jsonb NOT NULL DEFAULT '[]',
  discard_pile jsonb NOT NULL DEFAULT '[]',
  -- Convenience mirror of the top of discard_pile so realtime clients that only carry
  -- the summary row still know what to show.
  top_discard jsonb,
  -- 'draw' = current player still needs to draw; 'discard' = has drawn, must discard.
  turn_step text NOT NULL DEFAULT 'draw' CHECK (turn_step IN ('draw', 'discard')),
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  -- The winning melds captured at "going out" — snapshot for the finished screen.
  winning_melds jsonb,
  -- Draw pile has been rebuilt from discard this many times; capped in code so a
  -- deadlocked deck can't cycle forever (game ends by lowest hand total instead).
  reshuffle_count integer NOT NULL DEFAULT 0,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rummy_sessions_game_id ON rummy_sessions(game_id);

CREATE TABLE IF NOT EXISTS rummy_player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cards jsonb NOT NULL DEFAULT '[]',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rummy_player_hands_game_id ON rummy_player_hands(game_id);

ALTER TABLE rummy_sessions ENABLE ROW LEVEL SECURITY;
drop policy if exists "rummy_sessions_read" on rummy_sessions;
CREATE POLICY "rummy_sessions_read" ON rummy_sessions FOR SELECT USING (true);

ALTER TABLE rummy_player_hands ENABLE ROW LEVEL SECURITY;
drop policy if exists "rummy_player_hands_read" on rummy_player_hands;
CREATE POLICY "rummy_player_hands_read" ON rummy_player_hands FOR SELECT USING (true);

do $$ begin alter publication supabase_realtime add table rummy_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table rummy_player_hands; exception when duplicate_object then null; end $$;

-- Extend the game-type CHECK constraints so 'rummy' rows are accepted. Mirrors the
-- pattern used by every prior new-game migration.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'rummy', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run'
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
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room', 'troll_run'
)) NOT VALID;

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN (
    'anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee',
    'whot', 'rummy', 'crazy_eights', 'uno', 'ludo', 'mahjong', 'i_call_on', 'sudoku', 'tic_tac_toe',
    'word_hunt', 'chess', 'checkers', 'checkers_international', 'checkers_nigeria', 'ayo',
    'scrabble', 'describe_it', 'word_rush', 'snake_and_ladder', 'mafia', 'matching_pairs',
    'quiplash', 'quick_draw', 'crossword', 'word_search', 'word_scramble', 'word_grouping',
    'landmine', 'wordle_room', 'troll_run'
  )
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('rummy', 6)
ON CONFLICT (game_type) DO NOTHING;

-- Community leaderboard board. Without this seed, the winner's "Post your win" button on
-- the finished screen would silently return not_on_leaderboard (checklist §7).
INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Rummy', 'rummy', '#0891b2', 70, 'rummy', true)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    accent = EXCLUDED.accent,
    game_type = EXCLUDED.game_type,
    is_active = EXCLUDED.is_active;

-- Column-level select re-grant, mirroring 20261023120000_remove_ping_pong.sql. Any new
-- game table above needs anon/authenticated to keep read access to its columns so the
-- realtime publication works without leaking host_token from `games`.
do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('grant select on public.rummy_sessions to %I', role_name);
    execute format('grant select on public.rummy_player_hands to %I', role_name);
  end loop;
end $$;
