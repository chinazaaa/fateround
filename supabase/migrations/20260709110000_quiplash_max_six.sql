-- Quiplash plays best at 3–6 players; lower the lobby cap from 8.

INSERT INTO game_player_limits (game_type, max_players)
VALUES ('quiplash', 6)
ON CONFLICT (game_type) DO UPDATE SET max_players = 6;
