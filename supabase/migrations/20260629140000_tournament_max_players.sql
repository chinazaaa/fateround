-- Optional cap on how many players can join a tournament. NULL = unlimited.
alter table tournaments add column if not exists max_players integer;
