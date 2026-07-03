-- Group-bracket head-to-head: Whot/Scrabble rooms hold up to 4 players, so a match
-- row needs the full set of seated tournament_players, not just player_a/player_b.
-- `member_ids` holds that group (the tournament_player ids in the room). It stays
-- null for chess, which keeps using player_a_id/player_b_id.
alter table tournament_games add column if not exists member_ids jsonb;
