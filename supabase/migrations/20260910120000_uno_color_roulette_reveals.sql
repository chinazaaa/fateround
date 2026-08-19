-- UNO High Stakes — Colour Roulette per-event reveal counter.
--
-- The Roulette Master (>=5 reveals) and Roulette Executioner (>=8 reveals) trophies
-- credit the CASTER with the largest single-reveal count from one Colour Roulette
-- event. Prior code inferred that count from the target's current hand size minus
-- the opening deal (`handSize - 7`), which double-counted every card they'd already
-- drawn during the round — a mid-game roulette on a player already holding 12 cards
-- would report ~5 reveals even on the first Draw click, silently earning the caster
-- Roulette Master without doing anything.
--
-- Fix: track the actual reveal count on the session, incremented in the no-match
-- branch of the reveal handler and read on the match branch. Nullable — cleared on
-- resolve (or when a fresh Colour Roulette starts).

ALTER TABLE uno_sessions ADD COLUMN IF NOT EXISTS color_roulette_reveals int;

COMMENT ON COLUMN uno_sessions.color_roulette_reveals IS
  'No Mercy: number of cards the roulette target has already revealed in the current Colour Roulette event (NULL when no roulette is in progress). Trophies key off this exact per-event count, not hand-size deltas that also include unrelated draws.';

-- Column-level grant to match the rest of No Mercy's additions (post-0122 grants are
-- column-scoped, so anon/authenticated need explicit access or SELECT reads 42501).
GRANT SELECT (color_roulette_reveals) ON public.uno_sessions TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
