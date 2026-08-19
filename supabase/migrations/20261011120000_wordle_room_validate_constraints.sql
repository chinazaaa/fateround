-- Validate the pre-existing rows for the NOT VALID constraints added by the Wordle
-- Room migration (20261010120000_wordle_room.sql). Kept in its own transaction so a
-- full-table scan never blocks the NOT VALID constraint additions on the large tables.

ALTER TABLE games VALIDATE CONSTRAINT games_game_type_check;
ALTER TABLE app_feedback VALIDATE CONSTRAINT app_feedback_game_type_check;
ALTER TABLE game_player_limits VALIDATE CONSTRAINT game_player_limits_game_type_check;