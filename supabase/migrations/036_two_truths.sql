ALTER TABLE rounds ADD COLUMN IF NOT EXISTS ttl_metadata jsonb;

CREATE TABLE IF NOT EXISTS ttl_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  statement_a text NOT NULL,
  statement_b text NOT NULL,
  statement_c text NOT NULL,
  lie_index integer NOT NULL CHECK (lie_index >= 0 AND lie_index <= 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_ttl_statements_game_id ON ttl_statements(game_id);

ALTER TABLE ttl_statements ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_ttl_statements" on ttl_statements;
CREATE POLICY "public_ttl_statements" ON ttl_statements FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table ttl_statements; exception when duplicate_object then null; end $$;

CREATE TABLE IF NOT EXISTS ttl_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  guessed_index integer NOT NULL CHECK (guessed_index >= 0 AND guessed_index <= 2),
  is_correct boolean NOT NULL,
  points integer NOT NULL DEFAULT 0,
  guessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, round_id)
);

CREATE INDEX IF NOT EXISTS idx_ttl_guesses_game_id ON ttl_guesses(game_id);
CREATE INDEX IF NOT EXISTS idx_ttl_guesses_round_id ON ttl_guesses(round_id);

ALTER TABLE ttl_guesses ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_ttl_guesses" on ttl_guesses;
CREATE POLICY "public_ttl_guesses" ON ttl_guesses FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table ttl_guesses; exception when duplicate_object then null; end $$;

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
  'trivia',
  'two_truths'
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
  'trivia',
  'two_truths'
));
