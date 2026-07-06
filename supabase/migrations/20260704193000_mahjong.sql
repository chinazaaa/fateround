-- Mahjong: 4-player multiplayer tile table, rulesets, scoring metadata,
-- private state lockdown, and host-selectable house rules.

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mahjong_ruleset text NOT NULL DEFAULT 'fate_round',
ADD COLUMN IF NOT EXISTS mahjong_rule_options jsonb NOT NULL DEFAULT '{}';

ALTER TABLE games
DROP CONSTRAINT IF EXISTS games_mahjong_ruleset_check;

ALTER TABLE games
ADD CONSTRAINT games_mahjong_ruleset_check
CHECK (mahjong_ruleset IN ('fate_round', 'hong_kong', 'riichi', 'mcr'));

CREATE TABLE IF NOT EXISTS mahjong_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  ruleset text NOT NULL DEFAULT 'fate_round' CHECK (ruleset IN ('fate_round', 'hong_kong', 'riichi', 'mcr')),
  turn_order jsonb NOT NULL DEFAULT '[]',
  dealer_index integer NOT NULL DEFAULT 0,
  current_turn_index integer NOT NULL DEFAULT 0,
  phase text NOT NULL DEFAULT 'draw' CHECK (phase IN ('draw', 'discard', 'claim', 'finished')),
  wall jsonb NOT NULL DEFAULT '[]',
  dead_wall jsonb NOT NULL DEFAULT '[]',
  dora_indicators jsonb NOT NULL DEFAULT '[]',
  ura_dora_indicators jsonb NOT NULL DEFAULT '[]',
  honba integer NOT NULL DEFAULT 0,
  riichi_sticks integer NOT NULL DEFAULT 0,
  round_wind text NOT NULL DEFAULT 'east' CHECK (round_wind IN ('east', 'south', 'west', 'north')),
  hand_number integer NOT NULL DEFAULT 1,
  last_action text CHECK (last_action IN ('draw', 'discard', 'claim', 'kong', 'riichi')),
  hand_result text CHECK (hand_result IN ('win', 'exhaustive_draw', 'abortive_draw', 'chombo')),
  rule_options jsonb NOT NULL DEFAULT '{}',
  rinshan_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  chankan_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  ippatsu_eligible_player_ids jsonb NOT NULL DEFAULT '[]',
  exhaustive_draw_tenpai_player_ids jsonb NOT NULL DEFAULT '[]',
  scores jsonb NOT NULL DEFAULT '{}',
  discard_pile jsonb NOT NULL DEFAULT '[]',
  last_discard jsonb,
  claim_passes jsonb NOT NULL DEFAULT '[]',
  status_message text,
  winner_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  winner_player_ids jsonb NOT NULL DEFAULT '[]',
  winning_tile text,
  win_type text CHECK (win_type IN ('self_draw', 'discard')),
  score_summary jsonb,
  turn_deadline_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mahjong_sessions_game_id ON mahjong_sessions(game_id);

CREATE TABLE IF NOT EXISTS mahjong_player_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  seat text NOT NULL CHECK (seat IN ('east', 'south', 'west', 'north')),
  hand jsonb NOT NULL DEFAULT '[]',
  last_drawn_tile text,
  flowers jsonb NOT NULL DEFAULT '[]',
  riichi_declared boolean NOT NULL DEFAULT false,
  riichi_discard_index integer,
  temporary_furiten boolean NOT NULL DEFAULT false,
  permanent_furiten boolean NOT NULL DEFAULT false,
  melds jsonb NOT NULL DEFAULT '[]',
  discarded jsonb NOT NULL DEFAULT '[]',
  player_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id),
  UNIQUE (game_id, seat)
);

CREATE INDEX IF NOT EXISTS idx_mahjong_player_state_game_id ON mahjong_player_state(game_id);
CREATE INDEX IF NOT EXISTS idx_mahjong_player_state_player_id ON mahjong_player_state(player_id);

ALTER TABLE mahjong_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahjong_player_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mahjong_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE mahjong_player_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  'checkers'
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
  'checkers'
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
    'checkers'
  )
);

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('mahjong', 4)
ON CONFLICT (game_type) DO NOTHING;

GRANT SELECT (mahjong_ruleset, mahjong_rule_options) ON public.games TO anon, authenticated;

INSERT INTO product_updates (type, title, description, month, year, sort_order)
SELECT v.type, v.title, v.description, v.month, v.year, v.sort_order
FROM (
  VALUES
    (
      'new',
      'Mahjong',
      $$A 4-player multiplayer Mahjong table. Draw from the wall, discard, call Chow, Pung, Kong, and Mahjong, and race to complete a legal hand before the wall runs out.$$,
      7::smallint,
      2026::smallint,
      260::integer
    )
) AS v(type, title, description, month, year, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM product_updates pu WHERE pu.title = v.title
);
