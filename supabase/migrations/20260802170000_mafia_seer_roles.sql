-- Mafia: add Seer (village, full role reveal) and Mafia Seer (Mafia-team, full role reveal,
-- can resign to become a Regular Mafia and gain the kill vote).

-- 1. Widen role CHECK
ALTER TABLE mafia_player_states DROP CONSTRAINT IF EXISTS mafia_player_states_role_check;
ALTER TABLE mafia_player_states ADD CONSTRAINT mafia_player_states_role_check CHECK (
  role IN (
    'villager', 'doctor', 'detective', 'bodyguard', 'mayor', 'vigilante', 'tracker',
    'mafia', 'alpha_wolf', 'wolf_cub', 'framer',
    'jester', 'serial_killer', 'arsonist',
    'cupid', 'cursed_villager',
    'medium',
    'priest',
    'witch', 'little_girl', 'trapper',
    'aura_seer',
    'seer', 'mafia_seer'
  )
);

-- 2. Session columns — both are reusable-every-night single-target reveals (no per-player
-- "used" flag), resolved live from night_action_target_player_id like Aura Seer/Tracker.
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS seer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS seer_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS mafia_seer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_seer_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- 3. Game-level toggles
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_seer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_mafia_seer_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_seer_enabled, mafia_mafia_seer_enabled) ON public.games TO anon, authenticated;
