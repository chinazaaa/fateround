-- Validate constraints added with NOT VALID in 20260717120000_ping_pong.sql
-- Separating validation avoids holding an ACCESS EXCLUSIVE lock during the table scan.

ALTER TABLE games VALIDATE CONSTRAINT games_game_type_check;
ALTER TABLE app_feedback VALIDATE CONSTRAINT app_feedback_game_type_check;
ALTER TABLE game_player_limits VALIDATE CONSTRAINT game_player_limits_game_type_check;
ALTER TABLE games VALIDATE CONSTRAINT games_theme_check;
