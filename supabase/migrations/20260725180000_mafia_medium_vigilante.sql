-- Mafia: add Medium role (village, reads ghost chat at night, one-time revive)
-- and rework Vigilante to Wolvesville day-action model (day shoot OR reveal, each once).

-- 1. Expand role CHECK to include 'medium'
ALTER TABLE mafia_player_states DROP CONSTRAINT IF EXISTS mafia_player_states_role_check;
ALTER TABLE mafia_player_states ADD CONSTRAINT mafia_player_states_role_check CHECK (
  role IN (
    'villager', 'doctor', 'detective', 'bodyguard', 'mayor', 'vigilante', 'tracker',
    'mafia', 'alpha_wolf', 'wolf_cub', 'framer',
    'jester', 'serial_killer', 'arsonist',
    'cupid', 'cursed_villager',
    'medium',
    'priest'
  )
);

-- 2. Medium per-player state: track one-time revive usage
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS medium_revive_used boolean NOT NULL DEFAULT false;

-- 3. Medium per-session resolution column (who was revived this night)
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS medium_revive_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS medium_enabled boolean NOT NULL DEFAULT true;

-- 4. Medium game-level toggle
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_medium_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_medium_enabled) ON public.games TO anon, authenticated;

-- 5. Bodyguard rework: survives first attack, dies on second; auto-protects self
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS bodyguard_hits_taken integer NOT NULL DEFAULT 0;

-- 6. Vigilante rework: day-shoot + day-reveal (each one-time, not same day)
-- Rename vigilante_shots_used → track both actions separately.
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS vigilante_reveal_used boolean NOT NULL DEFAULT false;

-- 6. Vigilante day-action columns on session (store what happened this day phase)
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS vigilante_day_kill_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS vigilante_reveal_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- 7. Arsonist rework: douse 2 players per night, immune to mafia kill
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS night_action_target_player_id_2 uuid REFERENCES players(id) ON DELETE SET NULL;

-- 8. Priest role: one-time holy water during day, kills mafia or self-destructs
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS priest_holy_water_used boolean NOT NULL DEFAULT false;

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS priest_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_priest_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_priest_enabled) ON public.games TO anon, authenticated;
