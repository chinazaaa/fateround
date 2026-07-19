-- UNO 0-7 rule: the 7 (swap hands with a chosen player) needs a new session phase
-- 'swap_target' while the player picks who to swap with. Extend the phase CHECK.
-- (The 0-rule — pass all hands — reuses the normal 'playing' phase, no schema change.)
--
-- Forward migration so it applies whether or not 20260719120000_uno.sql shipped first.

ALTER TABLE uno_sessions DROP CONSTRAINT IF EXISTS uno_sessions_phase_check;
ALTER TABLE uno_sessions ADD CONSTRAINT uno_sessions_phase_check
  CHECK (phase IN ('playing', 'choose_color', 'challenge_window', 'swap_target', 'finished'));

NOTIFY pgrst, 'reload schema';
