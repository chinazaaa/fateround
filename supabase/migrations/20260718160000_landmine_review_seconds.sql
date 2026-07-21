-- Landmine — host-configurable review-window length.
--
-- The review-before-reveal phase (see 20260718150000_landmine_review) had a hardcoded window
-- (45s manual / 20s auto). This column lets the host pick it at create time. Options are
-- 15/20/30/45/60s; default 45 (the create flow seeds 45 for manual, 20 for auto). A NULL / invalid
-- value falls back to the mode default in `landmineReviewSeconds`, so old rows behave unchanged.

ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_review_seconds integer NOT NULL DEFAULT 45;

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN does
-- not extend them, so grant read on this non-secret setting or GAME_SELECT errors 42501.
GRANT SELECT (landmine_review_seconds) ON public.games TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   ALTER TABLE games DROP COLUMN IF EXISTS landmine_review_seconds;
-- ----------------------------------------------------------------------------
