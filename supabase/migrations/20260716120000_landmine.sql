-- Landmine — party word game. A category is shown and the system secretly plants a
-- "mine" (one of the obvious answers). Players type a blind answer; each answer is
-- peer-marked Valid/Void BEFORE the mine is revealed; then the mine is revealed and
-- hitters are zeroed (zero_points mode) or knocked out (elimination mode).
--
-- SECRECY: the mine must never reach the client before reveal. The whole answer pool
-- (landmine_categories) and the per-round chosen mine (landmine_round_mines) live in
-- RLS-on / NO-policy tables — only the service-role API routes read them. At reveal the
-- server copies the mine words into the (public) rounds.landmine_metadata.revealed_mines.

-- ── Per-round public metadata (phase, category, marking ring — NO mine) ─────────────
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS landmine_metadata jsonb;

-- ── Per-game settings ───────────────────────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_mode text NOT NULL DEFAULT 'zero_points'
  CHECK (landmine_mode IN ('zero_points', 'elimination'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_mine_count integer NOT NULL DEFAULT 1
  CHECK (landmine_mine_count BETWEEN 1 AND 3);
ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_originality_bonus boolean NOT NULL DEFAULT true;
-- Round count reuses games.rounds_count; answer timer reuses games.timer_seconds, the vote
-- timer reuses games.operative_timer_seconds, and the category-pick timer reuses
-- games.game_duration_seconds.

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN
-- does not extend them, so grant read on these non-secret settings or GAME_SELECT errors 42501.
GRANT SELECT (landmine_mode, landmine_mine_count, landmine_originality_bonus)
  ON public.games TO anon, authenticated;

-- ── Answers (one row per player per round; public for realtime) ──────────────────
CREATE TABLE IF NOT EXISTS landmine_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  answer text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  points integer,
  outcome text CHECK (outcome IN ('valid', 'original', 'void', 'mine', 'empty')),
  mine_hit boolean,
  is_original boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_landmine_answers_game_id ON landmine_answers(game_id);
CREATE INDEX IF NOT EXISTS idx_landmine_answers_round_id ON landmine_answers(round_id);

ALTER TABLE landmine_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "landmine_answers_read" ON landmine_answers;
CREATE POLICY "landmine_answers_read" ON landmine_answers FOR SELECT USING (true);

-- ── Peer marks (one row per marker per round; public for realtime) ───────────────
CREATE TABLE IF NOT EXISTS landmine_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  marker_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  valid boolean NOT NULL DEFAULT true,
  marked_at timestamptz,
  UNIQUE(marker_player_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_landmine_marks_game_id ON landmine_marks(game_id);
CREATE INDEX IF NOT EXISTS idx_landmine_marks_round_id ON landmine_marks(round_id);

ALTER TABLE landmine_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "landmine_marks_read" ON landmine_marks;
CREATE POLICY "landmine_marks_read" ON landmine_marks FOR SELECT USING (true);

-- ── Admin-authored category pools (SECRET — the mine is drawn from here) ──────────
-- entries is an ordered array of the obvious answers; the front of the list is the most
-- obvious, so the mine draw weights toward it. RLS on with NO policy: only the service-role
-- admin CRUD + start routes touch it. The public category picker returns names + counts only.
CREATE TABLE IF NOT EXISTS landmine_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  entries jsonb NOT NULL DEFAULT '[]',
  entry_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_landmine_categories_sort ON landmine_categories(sort_order, created_at);
ALTER TABLE landmine_categories ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policy: PostgREST denies all anon/authenticated access. Service role only.

-- ── Per-round chosen mine (SECRET until reveal) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS landmine_round_mines (
  round_id uuid PRIMARY KEY REFERENCES rounds(id) ON DELETE CASCADE,
  words text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE landmine_round_mines ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policy: clients can never read the mine. The reveal step copies the words
-- into the public rounds.landmine_metadata.revealed_mines. Not added to realtime.

-- ── Realtime publication (answers + marks only; NOT the secret tables) ───────────
do $$ begin alter publication supabase_realtime add table landmine_answers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table landmine_marks; exception when duplicate_object then null; end $$;

-- ── Extend game-type CHECK constraints ──────────────────────────────────────────
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general', 'smash_marry_kill', 'red_flag_green_flag', 'smash_or_pass', 'parent_approval',
  'would_you_rather', 'never_have_i_ever', 'pick_a_number', 'this_or_that', 'most_likely_to',
  'who_said_this', 'hot_seat', 'custom', 'anonymous_messages', 'secret_message', 'bingo',
  'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo',
  'i_call_on', 'sudoku', 'tic_tac_toe', 'word_hunt', 'chess', 'describe_it', 'scrabble',
  'snake_and_ladder', 'checkers', 'mahjong', 'mafia', 'matching_pairs', 'quiplash', 'word_rush',
  'quick_draw', 'ayo', 'crossword', 'word_search', 'word_scramble', 'landmine'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw', 'ayo', 'crossword', 'word_search',
  'word_scramble', 'landmine')
);

-- ── Seed player limits + community leaderboard ──────────────────────────────────
INSERT INTO game_player_limits (game_type, max_players)
VALUES ('landmine', 20)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Landmine', 'landmine', '#ef4444', 56, 'landmine', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;

-- ── Seed a few starter categories so the game is playable immediately ────────────
-- entries ordered obvious-first (the mine weights toward the front). The peer-marking phase
-- validates everything outside the list, so these need only cover the common answers.
INSERT INTO landmine_categories (name, entries, entry_count, sort_order)
VALUES
  ('Things found in school',
   '["pencil","pen","book","desk","teacher","chair","board","student","bag","ruler","chalk","eraser","table","classroom"]',
   14, 10),
  ('Fruits',
   '["apple","banana","orange","mango","grape","pineapple","strawberry","watermelon","lemon","pear","peach","cherry"]',
   12, 20),
  ('Animals',
   '["dog","cat","lion","elephant","cow","goat","snake","tiger","horse","monkey","rabbit","bird"]',
   12, 30),
  ('Countries',
   '["nigeria","ghana","usa","china","india","france","brazil","kenya","canada","egypt","japan","germany"]',
   12, 40),
  ('Colours',
   '["red","blue","green","yellow","black","white","orange","purple","pink","brown"]',
   10, 50),
  ('Things in a kitchen',
   '["spoon","plate","knife","pot","cup","fork","stove","fridge","kettle","bowl","pan","sink"]',
   12, 60)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   DROP TABLE IF EXISTS landmine_round_mines;
--   DROP TABLE IF EXISTS landmine_categories;
--   DROP TABLE IF EXISTS landmine_marks;
--   DROP TABLE IF EXISTS landmine_answers;
--   ALTER TABLE rounds DROP COLUMN IF EXISTS landmine_metadata;
--   ALTER TABLE games DROP COLUMN IF EXISTS landmine_mode, DROP COLUMN IF EXISTS landmine_mine_count,
--     DROP COLUMN IF EXISTS landmine_originality_bonus;
-- ----------------------------------------------------------------------------
