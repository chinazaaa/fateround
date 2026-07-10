-- Quiplash: one vote per player per round (pick funniest from all answers), not head-to-head battles.

ALTER TABLE quiplash_votes ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES rounds(id) ON DELETE CASCADE;

ALTER TABLE quiplash_votes ALTER COLUMN battle_id DROP NOT NULL;

-- Legacy battle votes keep round_id NULL so finished games still score via battles.
-- Do not backfill round_id from battles: one player could vote in multiple battles
-- per round, which would violate the one-vote-per-round index below.

ALTER TABLE quiplash_votes DROP CONSTRAINT IF EXISTS quiplash_votes_player_id_battle_id_key;

-- Clean up any partial apply that backfilled round_id (keep most recent vote).
DELETE FROM quiplash_votes v
USING (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY player_id, round_id
      ORDER BY voted_at DESC, id DESC
    ) AS rn
  FROM quiplash_votes
  WHERE round_id IS NOT NULL
) d
WHERE v.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiplash_votes_player_round
  ON quiplash_votes(player_id, round_id)
  WHERE round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quiplash_votes_round_id ON quiplash_votes(round_id);
