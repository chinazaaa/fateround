-- Mafia / Werewolf: social deduction game.
-- Server-authoritative write model: anon may READ (realtime needs it) but every
-- write goes through a service-role API route. Role secrecy is maintained via the API.

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_doctor_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_detective_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_count integer,
ADD COLUMN IF NOT EXISTS mafia_anonymous_votes boolean NOT NULL DEFAULT false;

GRANT SELECT (mafia_doctor_enabled, mafia_detective_enabled, mafia_count, mafia_anonymous_votes) ON public.games TO anon, authenticated;

CREATE TABLE IF NOT EXISTS mafia_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  
  phase text NOT NULL DEFAULT 'role_reveal' CHECK (phase IN ('role_reveal', 'night', 'day_report', 'discussion', 'voting', 'elimination', 'game_over')),
  day_number integer NOT NULL DEFAULT 0,
  phase_deadline timestamptz,
  
  mafia_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  doctor_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  detect_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  night_kill_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  vote_result_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  
  doctor_enabled boolean NOT NULL DEFAULT true,
  detective_enabled boolean NOT NULL DEFAULT true,
  mafia_count integer NOT NULL DEFAULT 1,
  anonymous_votes boolean NOT NULL DEFAULT false,
  
  winning_team text CHECK (winning_team IN ('village', 'mafia')),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mafia_sessions_game_id ON mafia_sessions(game_id);

CREATE TABLE IF NOT EXISTS mafia_player_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  
  role text NOT NULL CHECK (role IN ('villager', 'mafia', 'doctor', 'detective')),
  is_alive boolean NOT NULL DEFAULT true,
  death_day integer,
  death_cause text CHECK (death_cause IN ('mafia_kill', 'village_vote')),
  
  night_action_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  day_vote_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_mafia_player_states_game_id ON mafia_player_states(game_id);
CREATE INDEX IF NOT EXISTS idx_mafia_player_states_player_id ON mafia_player_states(player_id);

ALTER TABLE mafia_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mafia_player_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mafia_sessions_read" ON mafia_sessions;
CREATE POLICY "mafia_sessions_read" ON mafia_sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "mafia_player_states_read" ON mafia_player_states;
CREATE POLICY "mafia_player_states_read" ON mafia_player_states FOR SELECT USING (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mafia_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mafia_player_states;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Update constraints to include 'mafia'
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
  'mahjong',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'crazy_eights',
  'checkers',
  'mafia'
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
  'mahjong',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'chess',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'crazy_eights',
  'checkers',
  'mafia'
));

ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;
ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN (
    'anonymous_messages',
    'bingo',
    'codewords',
    'trivia',
    'two_truths',
    'monopoly',
    'yahtzee',
    'whot',
    'ludo',
    'mahjong',
    'i_call_on',
    'sudoku',
    'tic_tac_toe',
    'word_hunt',
    'chess',
    'describe_it',
    'scrabble',
    'snake_and_ladder',
    'crazy_eights',
    'checkers',
    'mafia'
  )
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('mafia', 16)
ON CONFLICT (game_type) DO NOTHING;

INSERT INTO product_updates (type, title, description, month, year, sort_order)
SELECT v.type, v.title, v.description, v.month, v.year, v.sort_order
FROM (
  VALUES
    (
      'new',
      'Mafia',
      $$An immersive multiplayer social deduction game. Uncover the secret Mafia among the Villagers, or eliminate the town before they catch you!$$,
      7::smallint,
      2026::smallint,
      270::integer
    )
) AS v(type, title, description, month, year, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM product_updates pu WHERE pu.title = v.title
);
