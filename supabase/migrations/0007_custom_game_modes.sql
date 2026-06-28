-- Custom Game Modes
ALTER TABLE games ADD COLUMN IF NOT EXISTS custom_slots jsonb;

-- Allow game_type = 'custom'
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE games ADD CONSTRAINT games_game_type_check CHECK (game_type IN (
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'would_you_rather',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom'
));
