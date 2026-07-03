-- Ludo rule variant: 'modern' (8 safe squares — starts + mid-arm stars) or
-- 'traditional' (no safe squares on the shared track; only a colour's own home
-- column is a refuge). Chosen at game creation, editable in the lobby before start.
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS ludo_variant text NOT NULL DEFAULT 'modern'
  CHECK (ludo_variant IN ('modern', 'traditional'));
