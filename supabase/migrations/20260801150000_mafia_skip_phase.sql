-- Mafia: let the town vote to skip ahead out of Discussion or Voting early, instead of
-- always waiting out the full timer. Requires the same majority threshold as a lynch vote
-- (floor(alive/2)+1), tracked per phase and reset whenever a new Discussion or Voting phase
-- starts.

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS skip_requested_player_ids uuid[] NOT NULL DEFAULT '{}';
