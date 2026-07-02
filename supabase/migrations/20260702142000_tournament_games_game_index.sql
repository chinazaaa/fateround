-- resolveHeadToHeadMatch looks up a tournament_games row by its game room on
-- every game finish, so index game_id for that lookup.
create index if not exists idx_tournament_games_game on tournament_games(game_id);
