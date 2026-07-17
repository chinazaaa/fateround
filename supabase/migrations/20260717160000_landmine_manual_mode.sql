-- Landmine — "manual" mine source. Adds a per-game setting that flips WHO plants the mine:
--   'system' (default) — today's behaviour: the caller picks a category and the server secretly
--                        draws the mine from the admin pool.
--   'manual'           — the rotating player (the "setter") types the category AND the mine
--                        word(s) themselves, then sits OUT the round. Everyone else answers →
--                        peer-marks → the mine is revealed, exactly as before. The setter earns
--                        the mirror of the round: the sum of all points the other players scored
--                        (same payout shape as Describe It's individual mode).
--
-- The source is orthogonal to landmine_mode (zero_points | elimination): manual pairs with either.

ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_mine_source text NOT NULL DEFAULT 'system'
  CHECK (landmine_mine_source IN ('system', 'manual'));

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN does
-- not extend them, so grant read on this non-secret setting or GAME_SELECT errors 42501.
GRANT SELECT (landmine_mine_source) ON public.games TO anon, authenticated;

-- The setter's per-round payout is recorded as a synthetic landmine_answers row (answer stays
-- blank; points hold the mirror sum) so tallyLandmineScores picks it up with no special-casing.
-- Extend the outcome CHECK to allow that 'setter' marker.
ALTER TABLE landmine_answers DROP CONSTRAINT IF EXISTS landmine_answers_outcome_check;
ALTER TABLE landmine_answers ADD CONSTRAINT landmine_answers_outcome_check
  CHECK (outcome IN ('valid', 'original', 'void', 'mine', 'empty', 'setter'));

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   ALTER TABLE landmine_answers DROP CONSTRAINT IF EXISTS landmine_answers_outcome_check;
--   ALTER TABLE landmine_answers ADD CONSTRAINT landmine_answers_outcome_check
--     CHECK (outcome IN ('valid', 'original', 'void', 'mine', 'empty'));
--   ALTER TABLE games DROP COLUMN IF EXISTS landmine_mine_source;
-- ----------------------------------------------------------------------------
