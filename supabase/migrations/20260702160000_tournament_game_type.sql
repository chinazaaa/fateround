-- The game a head-to-head bracket is played with (chess for now). Round-robin
-- tournaments pick a game per round instead, so this stays null for them.
alter table tournaments add column if not exists game_type text;
