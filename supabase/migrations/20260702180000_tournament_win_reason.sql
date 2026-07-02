-- How a head-to-head match was decided (chess result_reason: 'checkmate',
-- 'timeout', 'resignation', or 'walkover' for a removed no-show), so the bracket
-- results can show "X beat Y by resignation" etc. Null for undecided/round-robin.
alter table tournament_games add column if not exists win_reason text;
