ALTER TABLE games ADD COLUMN IF NOT EXISTS trivia_category text CHECK (trivia_category IN ('tech', 'general'));

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS trivia_metadata jsonb;

CREATE TABLE IF NOT EXISTS trivia_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  choice_index integer NOT NULL CHECK (choice_index >= 0 AND choice_index <= 3),
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  response_ms integer NOT NULL,
  points integer NOT NULL DEFAULT 0,
  UNIQUE(player_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_trivia_answers_game_id ON trivia_answers(game_id);
CREATE INDEX IF NOT EXISTS idx_trivia_answers_round_id ON trivia_answers(round_id);

ALTER TABLE trivia_answers ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_trivia_answers" on trivia_answers;
CREATE POLICY "public_trivia_answers" ON trivia_answers FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table trivia_answers; exception when duplicate_object then null; end $$;

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia'
));

ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE app_feedback ADD CONSTRAINT app_feedback_game_type_check CHECK (game_type IN (
  'general',
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia'
));
