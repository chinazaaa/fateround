-- Community leaderboard: record how many times each player won a game in a day.
--
-- A player can win the same game more than once across the day's rounds. The
-- (game_id, result_date, player_id) unique key keeps one row per player per
-- game/day, so we track repeat wins with a `wins` counter instead of duplicate
-- rows. Each row counts as `wins` toward the weekly/monthly standings.

alter table community_results
  add column if not exists wins integer not null default 1;

alter table community_results
  drop constraint if exists community_results_wins_positive;

alter table community_results
  add constraint community_results_wins_positive check (wins >= 1);
