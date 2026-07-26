-- Red Lady: visits another player each night. Safe from any attack aimed at herself while
-- out visiting, but dies if the player she visited was attacked that night, or turns out to
-- be Mafia or a Solo killer (Serial Killer/Arsonist).

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
    'witch', 'little_girl', 'trapper',
    'aura_seer', 'seer', 'mafia_seer',
    'red_lady'
  )
);

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS red_lady_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_red_lady_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_red_lady_enabled) ON public.games TO anon, authenticated;
