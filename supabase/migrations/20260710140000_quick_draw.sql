-- Quick Draw — draw weird prompts, fool everyone with fake titles (Drawful-style).

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS quick_draw_metadata jsonb;

CREATE TABLE IF NOT EXISTS quick_draw_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'drawing'
    CHECK (phase IN ('drawing', 'titling', 'voting', 'reveal', 'finished')),
  drawing_index integer NOT NULL DEFAULT 0,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quick_draw_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, player_id)
);

CREATE TABLE IF NOT EXISTS quick_draw_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  stroke_data jsonb NOT NULL DEFAULT '{}',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, round_id)
);

CREATE TABLE IF NOT EXISTS quick_draw_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  drawing_id uuid NOT NULL REFERENCES quick_draw_drawings(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_real boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(drawing_id, player_id)
);

CREATE TABLE IF NOT EXISTS quick_draw_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  drawing_id uuid NOT NULL REFERENCES quick_draw_drawings(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  chosen_title_id uuid NOT NULL REFERENCES quick_draw_titles(id) ON DELETE CASCADE,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, drawing_id)
);

CREATE INDEX IF NOT EXISTS idx_quick_draw_sessions_game_id ON quick_draw_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_assignments_round_id ON quick_draw_assignments(round_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_drawings_round_id ON quick_draw_drawings(round_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_titles_drawing_id ON quick_draw_titles(drawing_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_votes_drawing_id ON quick_draw_votes(drawing_id);

ALTER TABLE quick_draw_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_sessions" ON quick_draw_sessions;
CREATE POLICY "public_quick_draw_sessions" ON quick_draw_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_assignments" ON quick_draw_assignments;
CREATE POLICY "public_quick_draw_assignments" ON quick_draw_assignments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_drawings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_drawings" ON quick_draw_drawings;
CREATE POLICY "public_quick_draw_drawings" ON quick_draw_drawings FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_titles" ON quick_draw_titles;
CREATE POLICY "public_quick_draw_titles" ON quick_draw_titles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_votes" ON quick_draw_votes;
CREATE POLICY "public_quick_draw_votes" ON quick_draw_votes FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table quick_draw_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_assignments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_drawings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_titles; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_votes; exception when duplicate_object then null; end $$;

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
  'crazy_eights',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'checkers',
  'mahjong',
  'mafia',
  'matching_pairs',
  'quiplash',
  'word_rush',
  'quick_draw'
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
  'crazy_eights',
  'ludo',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'checkers',
  'mahjong',
  'mafia',
  'matching_pairs',
  'quiplash',
  'word_rush',
  'quick_draw'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths',
  'monopoly', 'yahtzee', 'whot', 'crazy_eights', 'ludo', 'i_call_on', 'sudoku', 'tic_tac_toe',
  'word_hunt', 'chess', 'describe_it', 'scrabble', 'snake_and_ladder', 'mafia', 'matching_pairs',
  'quiplash', 'word_rush', 'checkers', 'mahjong', 'quick_draw')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('quick_draw', 8)
ON CONFLICT (game_type) DO UPDATE SET max_players = 8;

INSERT INTO community_games (name, slug, accent, sort_order, game_type, is_active)
VALUES ('Quick Draw', 'quick-draw', '#8b5cf6', 51, 'quick_draw', true)
ON CONFLICT (slug) DO UPDATE
SET
  game_type = EXCLUDED.game_type,
  accent = EXCLUDED.accent,
  is_active = EXCLUDED.is_active;
