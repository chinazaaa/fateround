-- Protect leaderboard history: don't let deleting a community game silently
-- erase its recorded winners (which would also rewrite past week/month standings).
--
-- The original migration declared community_results.game_id with ON DELETE CASCADE.
-- Switch it to ON DELETE RESTRICT so a game that already has results can't be
-- hard-deleted; the admin UI hides games via is_active instead, and the delete
-- route blocks removal when history exists.

alter table community_results drop constraint if exists community_results_game_id_fkey;

alter table community_results
  add constraint community_results_game_id_fkey
  foreign key (game_id) references community_games (id) on delete restrict;
