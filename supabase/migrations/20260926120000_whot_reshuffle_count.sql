-- Track how many times the draw pile has been rebuilt from the discard in a
-- Whot session. Nigerian Whot with a small deck can hit a state where nobody
-- can play the top card and the draw pile keeps getting refilled from the
-- discard forever — the game just spins with no one making progress. Capping
-- reshuffles at WHOT_RESHUFFLE_LIMIT (1) lets the discard rebuild the draw
-- pile once; if the deck depletes a second time, the game ends by lowest
-- hand total (see finishWhotByLowestHand in src/lib/whot.ts).

alter table whot_sessions add column if not exists reshuffle_count int not null default 0;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted): drop the column.
--   alter table whot_sessions drop column if exists reshuffle_count;
-- ----------------------------------------------------------------------------
