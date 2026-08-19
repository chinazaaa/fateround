-- Validate the pre-existing rows for the NOT VALID constraints left behind by the two
-- Troll Run migrations (20261021120000_troll_run.sql, 20261022120000_troll_run_fixes.sql).
-- Kept in its own transaction so a full-table scan never blocks the constraint additions
-- on the large tables.
--
-- Every list here is a superset of the list it replaced — `games_theme_check` only gained
-- 'dark' and 'ping_pong', and the game-type lists only gained 'troll_run' — so no existing
-- row can fail validation.

ALTER TABLE games VALIDATE CONSTRAINT games_game_type_check;
ALTER TABLE games VALIDATE CONSTRAINT games_theme_check;
ALTER TABLE app_feedback VALIDATE CONSTRAINT app_feedback_game_type_check;
ALTER TABLE game_player_limits VALIDATE CONSTRAINT game_player_limits_game_type_check;
