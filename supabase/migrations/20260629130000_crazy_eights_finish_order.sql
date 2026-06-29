-- Track the order in which Crazy Eights players empty their hands.
--
-- Same fix as 20260629120000_whot_finish_order.sql, applied to Crazy Eights (it shares
-- Whot's timed-game model). In a TIMED game a player who empties their hand keeps playing
-- out the clock as a spectator while the others race to finish. Until now nothing recorded
-- WHO went out first: at game end every finished player sat at 0 cards / hand-sum 0 — a
-- dead tie — so placement ordered them arbitrarily, and the winner was whoever happened to
-- trigger the end condition rather than whoever actually finished first.
--
-- finish_order is the append-only list of player ids in the exact order they emptied their
-- hands. crazyEightsPlacementOrder() ranks these first (in this order), then everyone still
-- holding cards by lowest hand total. The winner is finish_order[0].

alter table crazy_eights_sessions add column if not exists finish_order uuid[] not null default '{}';

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted): drop the column.
--   alter table crazy_eights_sessions drop column if exists finish_order;
-- ----------------------------------------------------------------------------
