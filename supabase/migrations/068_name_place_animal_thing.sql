ALTER TABLE rounds ADD COLUMN IF NOT EXISTS npat_metadata jsonb;

CREATE TABLE IF NOT EXISTS npat_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  animal text NOT NULL DEFAULT '',
  place text NOT NULL DEFAULT '',
  thing text NOT NULL DEFAULT '',
  submitted_at timestamptz,
  score_name integer,
  score_animal integer,
  score_place integer,
  score_thing integer,
  UNIQUE(player_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_npat_answers_game_id ON npat_answers(game_id);
CREATE INDEX IF NOT EXISTS idx_npat_answers_round_id ON npat_answers(round_id);

CREATE TABLE IF NOT EXISTS npat_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  marker_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  valid_name boolean NOT NULL DEFAULT true,
  valid_animal boolean NOT NULL DEFAULT true,
  valid_place boolean NOT NULL DEFAULT true,
  valid_thing boolean NOT NULL DEFAULT true,
  marked_at timestamptz,
  UNIQUE(marker_player_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_npat_marks_game_id ON npat_marks(game_id);
CREATE INDEX IF NOT EXISTS idx_npat_marks_round_id ON npat_marks(round_id);

ALTER TABLE npat_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_npat_answers" ON npat_answers FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE npat_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_npat_marks" ON npat_marks FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE npat_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE npat_marks;

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
  'name_place_animal_thing'
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
  'name_place_animal_thing'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'name_place_animal_thing')
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('name_place_animal_thing', 20)
ON CONFLICT (game_type) DO NOTHING;
