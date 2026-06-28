-- Rename game type from name_place_animal_thing → i_call_on (068 may have run under the old id).
-- Drop constraints first so rows can use i_call_on before the new check is applied.

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_type_check;
ALTER TABLE app_feedback DROP CONSTRAINT IF EXISTS app_feedback_game_type_check;
ALTER TABLE game_player_limits DROP CONSTRAINT IF EXISTS game_player_limits_game_type_check;

UPDATE games SET game_type = 'i_call_on' WHERE game_type = 'name_place_animal_thing';
UPDATE app_feedback SET game_type = 'i_call_on' WHERE game_type = 'name_place_animal_thing';

UPDATE game_player_limits
SET game_type = 'i_call_on'
WHERE game_type = 'name_place_animal_thing';

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('i_call_on', 20)
ON CONFLICT (game_type) DO NOTHING;

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
  'i_call_on'
));

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
  'i_call_on'
));

ALTER TABLE game_player_limits ADD CONSTRAINT game_player_limits_game_type_check CHECK (
  game_type IN ('anonymous_messages', 'bingo', 'codewords', 'trivia', 'two_truths', 'monopoly', 'yahtzee', 'whot', 'ludo', 'i_call_on')
);
