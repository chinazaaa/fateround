-- Mafia: add Witch (protect + kill potion), Little Girl (opt-in night peek with a chance of
-- being caught), and Trapper (accumulate up to 3 traps, then activate them all at once to
-- block a Mafia kill and take out their weakest member).

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

-- 3. Little Girl: opt-in "open eyes" signaled by self-targeting night_action_target_player_id
-- (no extra persistent state needed — the 75/20/5 roll is resolved fresh each night).
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS little_girl_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_little_girl_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_little_girl_enabled) ON public.games TO anon, authenticated;

-- 4. Trapper: accumulates up to 3 traps across nights; self-targeting night_action_target_player_id
-- signals "activate all traps" for that night (cleared once fired).
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS trapper_trap_player_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS trapper_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_trapper_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_trapper_enabled) ON public.games TO anon, authenticated;
