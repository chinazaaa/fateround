-- Go Fish turn timer.
--
-- Adds `turn_deadline_at` so the client can render a countdown and the auto-expire route
-- can advance a stalled turn. Nullable — a game with `games.timer_seconds = 0` runs with
-- no per-turn clock, same as Whot / UNO.
--
-- Server writes the deadline on init (initializeGoFishGame) and on every ask persistence
-- (processGoFishAsk); the /api/gofish/expire-turn route reads it and auto-plays a random
-- legal ask when the deadline has genuinely passed.

ALTER TABLE gofish_sessions
  ADD COLUMN IF NOT EXISTS turn_deadline_at timestamptz;

COMMENT ON COLUMN gofish_sessions.turn_deadline_at IS
  'ISO deadline for the current player''s turn. Null = no timer configured on this game.';
