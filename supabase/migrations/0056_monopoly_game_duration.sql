-- Monopoly whole-game time limit (host sets at create; 0 = no limit).
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_duration_seconds integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN games.game_duration_seconds IS 'Monopoly: max active session length in seconds from session_started_at; 0 = unlimited.';
