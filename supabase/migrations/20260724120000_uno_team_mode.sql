-- UNO Team-Up: a 2v2 variant (4 players, 2 teams of 2). Teams are derived from seating
-- parity in turn_order (alternating A–B–A–B), so no per-player team column is needed —
-- only this on/off flag. A team wins the round the moment either member empties their hand.

ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_team_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN games.uno_team_mode IS 'UNO: 2v2 Team-Up mode (exactly 4 players, teammates sit across).';

GRANT SELECT (uno_team_mode) ON public.games TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
