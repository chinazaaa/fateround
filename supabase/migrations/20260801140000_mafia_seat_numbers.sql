-- Mafia: persist a fixed seat_number per player, assigned once at game start based on join
-- order. Seat numbers were previously derived from array index over query results ordered by
-- created_at — but mafia_player_states rows are bulk-inserted in one statement, so created_at
-- is identical across all of them, making the order (and therefore each player's number)
-- unstable between requests. A stored column fixes both determinism and permanence.

ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS seat_number integer NOT NULL DEFAULT 0;
