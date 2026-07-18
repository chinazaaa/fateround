-- Landmine — optional "review before reveal" phase toggle.
--
-- After peer marking, a review phase lets the reviewer check/override every Valid/Void verdict
-- before scores reveal (I Call On's caller review). The reviewer is the round's setter in manual
-- mode, or the HOST in auto mode (auto has no setter). This column lets a host turn that phase
-- off — when false, the round scores straight from marking with the peer verdicts, keeping auto
-- mode fully hands-off. Defaults ON; the create flow sets it per mode (manual on, auto off).

ALTER TABLE games ADD COLUMN IF NOT EXISTS landmine_review boolean NOT NULL DEFAULT true;

-- games uses COLUMN-level SELECT grants for the public roles (migration 0122). ADD COLUMN does
-- not extend them, so grant read on this non-secret setting or GAME_SELECT errors 42501.
GRANT SELECT (landmine_review) ON public.games TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   ALTER TABLE games DROP COLUMN IF EXISTS landmine_review;
-- ----------------------------------------------------------------------------
