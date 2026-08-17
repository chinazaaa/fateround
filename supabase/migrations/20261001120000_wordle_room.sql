-- Wordle Room — the multiplayer race mode (design spec §7).
--
-- Game model mirrors Word Hunt's server-authoritative pattern:
--   - `games.wordle_room_category` + `wordle_room_word_count` — host settings picked at
--     create/lobby time. The whole-game timer lives in the existing `games.timer_seconds`
--     (0 = untimed, per the convention monopoly/word-grouping use for "off").
--   - `rounds.wordle_room_metadata` — anon-readable room config (category, word count,
--     seed). NO answers in here.
--   - `wordle_room_solutions` — the fixed word sequence, server-only (RLS, no policies).
--     Anon must never read ahead in a competitive race.
--   - `wordle_room_guesses` — every graded guess, server-only (RLS, no policies). The
--     guess route (service role) re-grades and writes it.
--   - `wordle_room_progress` — one row per seated player, anon-READABLE + realtime, so
--     opponents see progress (which word, how many solved) without any letters leaking.

-- ── Per-game settings ───────────────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS wordle_room_category text;
ALTER TABLE games ADD COLUMN IF NOT EXISTS wordle_room_word_count integer;

-- Column-level grants (migration 0122 made grants column-level — new games columns
-- must be granted or client reads error).
do $$
declare
  game_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into game_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'games' and column_name <> 'host_token';

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.games from %I', role_name);
    execute format('grant select (%s) on public.games to %I', game_cols, role_name);
  end loop;
end $$;

-- ── Round metadata ──────────────────────────────────────────────────────────────
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS wordle_room_metadata jsonb;
GRANT SELECT (wordle_room_metadata) ON rounds TO anon, authenticated;

-- ── Solutions table (server-only word sequence) ────────────────────────────────
CREATE TABLE IF NOT EXISTS wordle_room_solutions (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  words jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wordle_room_solutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wordle_room_solutions_select" ON wordle_room_solutions;
DROP POLICY IF EXISTS "wordle_room_solutions_insert" ON wordle_room_solutions;
-- Deliberately NO policies: the service role bypasses RLS and is the only writer
-- (start route) and reader (guess route). Anon/authenticated get no grants either,
-- so the sequence is unreachable from the client.

-- ── Guesses table (server-only graded guesses) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS wordle_room_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  word_index integer NOT NULL,
  guess text NOT NULL,
  state jsonb NOT NULL,
  is_correct boolean NOT NULL,
  points_awarded integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wordle_room_guesses_game_id ON wordle_room_guesses(game_id);
CREATE INDEX IF NOT EXISTS idx_wordle_room_guesses_round_id ON wordle_room_guesses(round_id);
CREATE INDEX IF NOT EXISTS idx_wordle_room_guesses_player_id ON wordle_room_guesses(player_id);

ALTER TABLE wordle_room_guesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wordle_room_guesses_select" ON wordle_room_guesses;
-- NO policies: every write and read goes through the service-role guess route
-- (assertPlayer + server re-grade). Anon never reads another player's guess letters.

-- ── Progress table (anon-readable, realtime) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wordle_room_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  word_index integer NOT NULL DEFAULT 0,
  current_word_guesses integer NOT NULL DEFAULT 0,
  words_solved integer NOT NULL DEFAULT 0,
  total_guesses integer NOT NULL DEFAULT 0,
  total_time_ms bigint,
  finished boolean NOT NULL DEFAULT false,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wordle_room_progress_game_id ON wordle_room_progress(game_id);
CREATE INDEX IF NOT EXISTS idx_wordle_room_progress_round_id ON wordle_room_progress(round_id);
CREATE INDEX IF NOT EXISTS idx_wordle_room_progress_player_id ON wordle_room_progress(player_id);

ALTER TABLE wordle_room_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wordle_room_progress_read" ON wordle_room_progress;
CREATE POLICY "wordle_room_progress_read" ON wordle_room_progress FOR SELECT USING (true);
GRANT SELECT ON public.wordle_room_progress TO anon, authenticated;

do $$ begin alter publication supabase_realtime add table wordle_room_progress; exception when duplicate_object then null; end $$;

-- ── Extend game-type CHECK constraints ─────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine', 'ping_pong', 'uno',
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room'
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
  'checkers_international', 'checkers_nigeria', 'word_grouping', 'wordle_room'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble', 'landmine', 'ping_pong', 'uno', 'checkers_international', 'checkers_nigeria',
  'word_grouping', 'wordle_room')
);

-- ── Seed player limits + community leaderboard ─────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('wordle_room', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Wordle Room', 'wordle-room', '#16a34a', 61, 'wordle_room', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';