-- Junior Mafia rework: instead of granting the mafia a bonus kill the next night,
-- the Junior Mafia picks a specific revenge target (during any phase). If they die,
-- that target dies with them. If they die without picking, a random valid target is
-- chosen. If they flee (leave the game), the target does NOT die.
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS wolf_cub_revenge_target_player_id uuid REFERENCES players(id) DEFAULT NULL;

GRANT SELECT (wolf_cub_revenge_target_player_id) ON public.mafia_player_states TO anon, authenticated;
