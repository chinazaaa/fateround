-- Expand the death_cause CHECK to include all causes the engine can produce.
-- Missing: 'witch_kill', 'trap_kill', 'red_lady_death' — their deaths silently
-- failed because the DB rejected the value while the code never checked the error.

ALTER TABLE mafia_player_states DROP CONSTRAINT IF EXISTS mafia_player_states_death_cause_check;
ALTER TABLE mafia_player_states ADD CONSTRAINT mafia_player_states_death_cause_check CHECK (
  death_cause IN (
    'mafia_kill',
    'village_vote',
    'serial_kill',
    'arson',
    'vigilante_kill',
    'witch_kill',
    'trap_kill',
    'red_lady_death'
  )
);
