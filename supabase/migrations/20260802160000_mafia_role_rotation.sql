-- Mafia: "don't repeat last round's role" fairness check, covering every role (not just
-- Mafia). Stores a map of player_id -> role from the last round played in this room.
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_last_roles jsonb;
