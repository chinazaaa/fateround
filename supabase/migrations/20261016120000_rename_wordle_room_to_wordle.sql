-- Rename user-facing "Wordle Room" to "Wordle" and update landing slug.
-- The internal game_type identifier stays 'wordle_room'.

UPDATE community_games
SET name = 'Wordle', slug = 'wordle'
WHERE game_type = 'wordle_room';
