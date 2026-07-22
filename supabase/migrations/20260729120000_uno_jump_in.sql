-- UNO Jump-In: an optional host toggle. When on, any player holding a card that's an EXACT
-- match for the settled top card (same colour AND same number, or same colour + same symbol for
-- action cards) may play it instantly, out of turn. Play then resumes from the seat immediately
-- after the jumper — seats that would have played in between are skipped. Wild / Wild Draw Four
-- are never eligible, and Jump-In is disabled while a Draw penalty is pending. Off by default.

ALTER TABLE games ADD COLUMN IF NOT EXISTS uno_jump_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN games.uno_jump_in IS 'UNO: Jump-In — play an exact-match card out of turn.';

GRANT SELECT (uno_jump_in) ON public.games TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
