-- Track which die values are still to be played after a two-dice roll (e.g. [6, 3]).

ALTER TABLE ludo_sessions
  ADD COLUMN IF NOT EXISTS remaining_dice jsonb;
