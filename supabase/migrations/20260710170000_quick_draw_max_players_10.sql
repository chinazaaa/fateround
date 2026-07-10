-- Quick Draw lobby cap raised from 8 to 10 players.
UPDATE game_player_limits
SET max_players = 10
WHERE game_type = 'quick_draw';
