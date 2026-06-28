ALTER TABLE participants ADD COLUMN IF NOT EXISTS submitted_by_player_id uuid REFERENCES players(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_participants_submitted_by ON participants(submitted_by_player_id) WHERE submitted_by_player_id IS NOT NULL;
