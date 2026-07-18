-- Landmine — elimination time limit. Elimination mode plays to "last player standing", but if
-- nobody hits a mine that never triggers and the game runs forever. This adds a wall-clock time
-- limit (from session start): the game ends when someone's last-standing OR the clock runs out,
-- ranking survivors by score. Set at create, editable in the host lobby.
--
-- Stored in its own column: landmine already uses game_duration_seconds for the category/setup
-- timer, timer_seconds for the answer timer, and operative_timer_seconds for the vote timer.

ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_elim_seconds integer NOT NULL DEFAULT 300
  CHECK (landmine_elim_seconds BETWEEN 60 AND 3600);

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN does
-- not extend them, so grant read on this non-secret setting or GAME_SELECT errors 42501.
GRANT SELECT (landmine_elim_seconds) ON public.games TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   ALTER TABLE games DROP COLUMN IF EXISTS landmine_elim_seconds;
-- ----------------------------------------------------------------------------
