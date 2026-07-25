-- Mafia: add Witch (heal + kill potion, each once per game), Little Girl (passive night
-- peek at the Mafia's target, risk of being caught), and Trapper (nightly house trap that
-- blocks the Mafia kill and reveals which Mafia members targeted the trapped house).

-- 1. Expand role CHECK
ALTER TABLE mafia_player_states DROP CONSTRAINT IF EXISTS mafia_player_states_role_check;
ALTER TABLE mafia_player_states ADD CONSTRAINT mafia_player_states_role_check CHECK (
  role IN (
    'villager', 'doctor', 'detective', 'bodyguard', 'mayor', 'vigilante', 'tracker',
    'mafia', 'alpha_wolf', 'wolf_cub', 'framer',
    'jester', 'serial_killer', 'arsonist',
    'cupid', 'cursed_villager',
    'medium',
    'priest',
    'witch', 'little_girl', 'trapper'
  )
);

-- 2. Witch: two single-use potions per game
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS witch_heal_used boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS witch_kill_used boolean NOT NULL DEFAULT false;

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS witch_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_witch_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_witch_enabled) ON public.games TO anon, authenticated;

-- 3. Little Girl: no persistent per-player state needed (passive role, resolved fresh each
-- night from the Mafia's existing night_action_target_player_id).
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS little_girl_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_little_girl_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_little_girl_enabled) ON public.games TO anon, authenticated;

-- 4. Trapper: reusable nightly action, uses the standard night_action_target_player_id column.
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS trapper_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_trapper_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_trapper_enabled) ON public.games TO anon, authenticated;
