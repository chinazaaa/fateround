-- Mafia: split "Detective" into its two real Wolvesville roles. What this platform called
-- Detective (single-target alignment reveal) is actually Wolvesville's Aura Seer — renamed
-- here. The real Detective checks two players each night for same-team membership; it reuses
-- the freed-up 'detective' role value and detective_enabled/mafia_detective_enabled columns.

-- 1. Widen role CHECK to add 'aura_seer' ('detective' stays allowed — now the new role)
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
    'aura_seer'
  )
);

-- 2. Rename the old Detective's infra to Aura Seer
ALTER TABLE mafia_sessions RENAME COLUMN detective_enabled TO aura_seer_enabled;
ALTER TABLE mafia_sessions RENAME COLUMN detect_target_player_id TO aura_seer_target_player_id;
ALTER TABLE games RENAME COLUMN mafia_detective_enabled TO mafia_aura_seer_enabled;

-- 3. New Detective (two-player same-team check) reuses the freed-up names. Resolved live each
-- night from the Detective's own night_action_target_player_id / _2 — no extra columns needed.
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS detective_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_detective_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_aura_seer_enabled, mafia_detective_enabled) ON public.games TO anon, authenticated;
