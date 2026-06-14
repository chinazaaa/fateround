-- Host-configurable gender-based rounds (SMK, pair games, custom)
ALTER TABLE games ADD COLUMN IF NOT EXISTS gender_based boolean NOT NULL DEFAULT true;
