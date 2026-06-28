-- Default anonymous room lobby cap (app also uses ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS = 20).
-- Superseded by 023_anonymous_room_max_players_20.sql for the 2–20 cap.
ALTER TABLE games ALTER COLUMN max_players SET DEFAULT 20;
