CREATE TABLE IF NOT EXISTS codewords_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  words text[] NOT NULL,
  key text[] NOT NULL,
  starting_team text NOT NULL CHECK (starting_team IN ('red', 'blue')),
  revealed_indices integer[] NOT NULL DEFAULT '{}',
  current_turn text NOT NULL CHECK (current_turn IN ('red', 'blue')),
  guesses_remaining integer,
  current_clue_word text,
  current_clue_number integer,
  winner text CHECK (winner IN ('red', 'blue')),
  assassin_team text CHECK (assassin_team IN ('red', 'blue')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS codewords_player_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team text NOT NULL CHECK (team IN ('red', 'blue')),
  role text NOT NULL CHECK (role IN ('spymaster', 'operative')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_codewords_boards_game_id ON codewords_boards(game_id);
CREATE INDEX IF NOT EXISTS idx_codewords_player_roles_game_id ON codewords_player_roles(game_id);

ALTER TABLE codewords_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE codewords_player_roles ENABLE ROW LEVEL SECURITY;

drop policy if exists "public_codewords_boards" on codewords_boards;
CREATE POLICY "public_codewords_boards" ON codewords_boards FOR ALL USING (true) WITH CHECK (true);
drop policy if exists "public_codewords_player_roles" on codewords_player_roles;
CREATE POLICY "public_codewords_player_roles" ON codewords_player_roles FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table codewords_boards; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table codewords_player_roles; exception when duplicate_object then null; end $$;

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
  'codewords'
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
  'codewords'
));
