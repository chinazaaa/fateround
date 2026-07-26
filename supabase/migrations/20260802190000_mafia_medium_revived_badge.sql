-- Mafia: track whether a player was revived by the Medium, so their tile in the roster
-- grid can show a small badge — purely cosmetic, doesn't affect any game logic. Reset to
-- false whenever the player dies again so a badge from an earlier revival doesn't linger
-- on a since-re-killed player.
ALTER TABLE mafia_player_states
ADD COLUMN IF NOT EXISTS revived_by_medium boolean NOT NULL DEFAULT false;

GRANT SELECT (revived_by_medium) ON public.mafia_player_states TO anon, authenticated;
