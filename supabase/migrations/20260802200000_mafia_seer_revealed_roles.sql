-- Mafia Seer: reveals now broadcast automatically to the whole mafia crew (in their
-- secret chat) instead of requiring the seer to manually relay it, matching Wolvesville.
-- This column accumulates every {playerId, role} pair the Mafia Seer has ever revealed
-- across the game, so the crew can see a persistent role badge on that player's tile —
-- unlike mafia_seer_target_player_id (single latest target), this is append-only.
ALTER TABLE mafia_sessions
ADD COLUMN IF NOT EXISTS mafia_seer_revealed jsonb NOT NULL DEFAULT '[]'::jsonb;

GRANT SELECT (mafia_seer_revealed) ON public.mafia_sessions TO anon, authenticated;
