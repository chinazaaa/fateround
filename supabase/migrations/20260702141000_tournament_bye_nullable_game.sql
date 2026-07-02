-- A bye in a head-to-head bracket advances a player without a match, so its
-- tournament_games row has no game room. Allow game_id to be null for byes.
-- (Round-robin games and real matches always set it.)
alter table tournament_games alter column game_id drop not null;
