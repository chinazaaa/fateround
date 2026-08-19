-- UNO High Stakes (No Mercy) — Colour Roulette card. When the current player plays a
-- Colour Roulette wild, the NEXT player must call the colour under a short deadline; if
-- they don't they must reveal cards until they turn one up. This session-scoped column
-- pins the player whose Colour Roulette response is pending. Missed from the original
-- no_mercy migration (20260901120000_uno_no_mercy.sql) — engine code writes and reads
-- this column, and UNO_SESSION_SELECT names it, so its absence 400s every
-- uno_sessions SELECT on the client until we add it.

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS color_roulette_player_id uuid;

COMMENT ON COLUMN uno_sessions.color_roulette_player_id IS
  'No Mercy: player id who must respond to an in-flight Colour Roulette play (NULL when none is pending).';

-- Column-level grant to match the rest of the No Mercy additions (0122 made grants
-- column-level, so anon/authenticated need explicit access or SELECT reads 42501).
GRANT SELECT (color_roulette_player_id) ON public.uno_sessions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
