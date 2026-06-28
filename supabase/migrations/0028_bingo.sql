CREATE TABLE IF NOT EXISTS bingo_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cells integer[] NOT NULL,
  marked_indices integer[] NOT NULL DEFAULT '{12}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS bingo_called_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number >= 1 AND number <= 75),
  called_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, number)
);

CREATE TABLE IF NOT EXISTS bingo_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pattern text NOT NULL DEFAULT 'line' CHECK (pattern IN ('line', 'full_house')),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bingo_cards_game_id ON bingo_cards(game_id);
CREATE INDEX IF NOT EXISTS idx_bingo_called_numbers_game_id ON bingo_called_numbers(game_id);
CREATE INDEX IF NOT EXISTS idx_bingo_claims_game_id ON bingo_claims(game_id);

ALTER TABLE bingo_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_called_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_claims ENABLE ROW LEVEL SECURITY;

drop policy if exists "public_bingo_cards" on bingo_cards;
CREATE POLICY "public_bingo_cards" ON bingo_cards FOR ALL USING (true) WITH CHECK (true);
drop policy if exists "public_bingo_called_numbers" on bingo_called_numbers;
CREATE POLICY "public_bingo_called_numbers" ON bingo_called_numbers FOR ALL USING (true) WITH CHECK (true);
drop policy if exists "public_bingo_claims" on bingo_claims;
CREATE POLICY "public_bingo_claims" ON bingo_claims FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table bingo_cards; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table bingo_called_numbers; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table bingo_claims; exception when duplicate_object then null; end $$;

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
  'bingo'
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
  'bingo'
));
