-- UNO Team-Up: mid-round teammate leave.
--
-- When a player leaves a 2v2 game mid-round we can't just splice them out of
-- turn_order — teams are derived from A-B-A-B seat parity, which needs exactly 4
-- seats. Instead the leaver STAYS in turn_order and is recorded in
-- left_player_ids so the turn engine + placement skip them while parity stays
-- intact. Their remaining teammate is then asked to continue solo (1v2) or
-- forfeit, via a new paused phase 'team_leave_decision'; team_decider_id names
-- who must choose.

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS left_player_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS team_decider_id uuid;

COMMENT ON COLUMN uno_sessions.left_player_ids IS 'UNO: players who left mid-round — kept in turn_order (parity) but skipped by the turn engine + placement.';
COMMENT ON COLUMN uno_sessions.team_decider_id IS 'UNO Team-Up: the remaining teammate who must choose continue-solo vs forfeit while phase = team_leave_decision.';

-- Add the paused decision phase to the CHECK.
ALTER TABLE uno_sessions DROP CONSTRAINT IF EXISTS uno_sessions_phase_check;
ALTER TABLE uno_sessions ADD CONSTRAINT uno_sessions_phase_check
  CHECK (phase IN ('playing', 'choose_color', 'challenge_window', 'swap_target', 'team_leave_decision', 'finished'));

NOTIFY pgrst, 'reload schema';
