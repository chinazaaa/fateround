-- Role-based achievements let a single match crown several winners, and one player
-- can hold more than one (e.g. Describe It's best describer AND best guesser). The
-- original dedup ledger keyed on (source_game_id, player_id), which capped a player
-- to a single self-post per match — fine when every game had one winner, but it now
-- blocks a deserved second achievement.
--
-- Widen the uniqueness to include the leaderboard entry, so dedup is per
-- (match, player, leaderboard row). Normal single-winner games are unaffected: they
-- still map to exactly one community_game_id per match.

alter table community_self_posts
  drop constraint if exists community_self_posts_source_game_id_player_id_key;

alter table community_self_posts
  drop constraint if exists community_self_posts_source_player_entry_key;

alter table community_self_posts
  add constraint community_self_posts_source_player_entry_key
  unique (source_game_id, player_id, community_game_id);
