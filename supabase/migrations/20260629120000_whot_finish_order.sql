-- Track the order in which Whot players empty their hands.
--
-- In a TIMED Whot game, a player who empties their hand keeps playing out the clock
-- as a spectator while the others race to finish. Until now nothing recorded WHO went
-- out first: at game end every finished player sat at 0 cards / hand-sum 0 — a dead tie
-- — so the placement sort ordered them arbitrarily (by player_order). The player who
-- emptied first could land 2nd or 3rd, and the winner was whoever happened to trigger
-- the end condition rather than whoever actually finished first.
--
-- finish_order is the append-only list of player ids in the exact order they emptied
-- their hands. whotPlacementOrder() ranks these first (in this order), then everyone
-- still holding cards by lowest hand total. The winner is finish_order[0].

alter table whot_sessions add column if not exists finish_order uuid[] not null default '{}';

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted): drop the column.
--   alter table whot_sessions drop column if exists finish_order;
-- ----------------------------------------------------------------------------
