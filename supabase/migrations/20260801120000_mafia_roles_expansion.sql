-- Mafia: expand from 4 roles to 16 roles/conditions (Wolvesville-style redesign, Phase 1).
-- Also fixes two pre-existing bugs found during audit:
--   1. mafia_chat_messages.scope CHECK only allowed ('night','day') but chat/route.ts
--      inserts scope='ghost' for eliminated players — that insert was failing silently.
--   2. mafia_sessions.phase CHECK listed 'discussion'/'voting' which the app never uses;
--      the app always uses 'day' for both. Corrected to match the real phase set.

-- 1. Fix chat scope CHECK (ghost bug)
ALTER TABLE mafia_chat_messages DROP CONSTRAINT IF EXISTS mafia_chat_messages_scope_check;
ALTER TABLE mafia_chat_messages ADD CONSTRAINT mafia_chat_messages_scope_check CHECK (scope IN ('night', 'day', 'ghost'));

-- 2. Fix phase CHECK to match real phase set used by the app
ALTER TABLE mafia_sessions DROP CONSTRAINT IF EXISTS mafia_sessions_phase_check;
ALTER TABLE mafia_sessions ADD CONSTRAINT mafia_sessions_phase_check CHECK (
  phase IN ('role_reveal', 'night', 'day_report', 'day', 'elimination', 'game_over')
);

-- 3. Expand role CHECK on mafia_player_states to the 16-role catalog
ALTER TABLE mafia_player_states DROP CONSTRAINT IF EXISTS mafia_player_states_role_check;
ALTER TABLE mafia_player_states ADD CONSTRAINT mafia_player_states_role_check CHECK (
  role IN (
    'villager', 'doctor', 'detective', 'bodyguard', 'mayor', 'vigilante', 'tracker',
    'mafia', 'alpha_wolf', 'wolf_cub', 'framer',
    'jester', 'serial_killer', 'arsonist',
    'cupid', 'cursed_villager'
  )
);

-- 4. Expand death_cause CHECK
ALTER TABLE mafia_player_states DROP CONSTRAINT IF EXISTS mafia_player_states_death_cause_check;
ALTER TABLE mafia_player_states ADD CONSTRAINT mafia_player_states_death_cause_check CHECK (
  death_cause IN ('mafia_kill', 'village_vote', 'serial_kill', 'arson', 'vigilante_kill')
);

-- 5. Expand winning_team CHECK on mafia_sessions
ALTER TABLE mafia_sessions DROP CONSTRAINT IF EXISTS mafia_sessions_winning_team_check;
ALTER TABLE mafia_sessions ADD CONSTRAINT mafia_sessions_winning_team_check CHECK (
  winning_team IN ('village', 'mafia', 'jester', 'serial_killer', 'arsonist', 'lovers')
);

-- 6. New per-session role-resolution columns
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS serial_kill_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS arson_ignite boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS bodyguard_target_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bodyguard_sacrifice_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tracker_visited_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS framed_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS wolf_cub_revenge_pending boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS cupid_lover_ids uuid[];

-- 7. New per-player-state columns
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS doused_by_arsonist boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS vigilante_shots_used integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_lover boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS lover_partner_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- 7b. New per-session enable-flag columns (mirrors existing doctor_enabled/detective_enabled
-- on this table — snapshotted from the games row at game-start, same as those two)
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS bodyguard_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mayor_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS vigilante_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS tracker_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS alpha_wolf_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS wolf_cub_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS framer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS jester_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS serial_killer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS arsonist_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS cupid_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS cursed_villager_enabled boolean NOT NULL DEFAULT true;

-- 8. New per-role enable toggles on games (mirrors existing mafia_doctor_enabled/mafia_detective_enabled)
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_bodyguard_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_mayor_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_vigilante_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_tracker_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_alpha_wolf_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_wolf_cub_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_framer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_jester_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_serial_killer_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_arsonist_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_cupid_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS mafia_cursed_villager_enabled boolean NOT NULL DEFAULT true;

GRANT SELECT (
  mafia_bodyguard_enabled, mafia_mayor_enabled, mafia_vigilante_enabled, mafia_tracker_enabled,
  mafia_alpha_wolf_enabled, mafia_wolf_cub_enabled, mafia_framer_enabled,
  mafia_jester_enabled, mafia_serial_killer_enabled, mafia_arsonist_enabled,
  mafia_cupid_enabled, mafia_cursed_villager_enabled
) ON public.games TO anon, authenticated;
