-- Quiplash: one vote per player per round (pick funniest from all answers), not head-to-head battles.

ALTER TABLE quiplash_votes ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES rounds(id) ON DELETE CASCADE;

ALTER TABLE quiplash_votes ALTER COLUMN battle_id DROP NOT NULL;

-- Backfill round_id from battles for any existing rows.
UPDATE quiplash_votes v
SET round_id = b.round_id
FROM quiplash_battles b
WHERE v.battle_id = b.id AND v.round_id IS NULL;

ALTER TABLE quiplash_votes DROP CONSTRAINT IF EXISTS quiplash_votes_player_id_battle_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiplash_votes_player_round
  ON quiplash_votes(player_id, round_id)
  WHERE round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quiplash_votes_round_id ON quiplash_votes(round_id);
