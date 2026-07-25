-- Mafia: generalize the "don't repeat last round's role" fairness check from Mafia-team-only
-- to every role. Stores a map of player_id -> role from the last round played in this room.
-- Supersedes mafia_last_team_player_ids (kept, unused, to avoid a risky column drop).
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_last_roles jsonb;
