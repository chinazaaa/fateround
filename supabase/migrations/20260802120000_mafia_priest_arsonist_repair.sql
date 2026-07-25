-- Repair migration.
--
-- 20260725180000_mafia_medium_vigilante.sql was applied to production when it first
-- merged (PR #711). PR #714 then APPENDED sections 7 & 8 to that same already-applied
-- file — the Arsonist double-douse column and the whole Priest role. Because Supabase
-- records applied migrations by version, `supabase db push` skipped the file on the
-- next deploy and those statements never ran on production.
--
-- The shipped code selects games.mafia_priest_enabled at game start, so every Mafia
-- game on production failed with "Failed to load game settings" (silently — that code
-- path never logged the underlying Postgres error).
--
-- This replays only the missed statements. Every statement is idempotent, so it is a
-- no-op on environments where the original file was applied after the edit (dev).

-- 1. Role CHECK constraint — the edit added 'priest' to the allowed set.
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

-- 2. Arsonist rework: douse 2 players per night, immune to mafia kill.
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS night_action_target_player_id_2 uuid REFERENCES players(id) ON DELETE SET NULL;

-- 3. Priest role: one-time holy water during day, kills mafia or self-destructs.
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS priest_holy_water_used boolean NOT NULL DEFAULT false;

ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS priest_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_priest_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (mafia_priest_enabled) ON public.games TO anon, authenticated;
