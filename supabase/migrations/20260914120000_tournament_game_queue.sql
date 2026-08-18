-- Pre-planned playlist for round-robin tournaments: an ordered array of
-- {gameType, roundsCount, timerSeconds, ...} entries. When set (non-empty),
-- the tournament auto-spawns each round from the next entry; when null/empty
-- the host picks each game live from the detail page (freestyle mode).
-- Freestyle stays the default for other formats (h2h/knockout/school), which
-- have their own game selected at creation.
alter table tournaments add column if not exists game_queue jsonb;
