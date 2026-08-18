-- Optional shared Who Said This deck for a round-robin tournament: when a host
-- uploads a WST CSV (or picks the platform pack) at tournament-create time,
-- it's stored here and every planned Who Said This game in this tournament
-- draws from it instead of running player-submit mode. Null / empty = fall
-- back to the default player-submit behaviour, same as before.
-- Same rationale as custom_trivia_pack: never exposed in the public GET
-- response — leaking a CSV of pre-set answers to any caller with a tournament
-- code would spoil every WST game.
alter table tournaments add column if not exists custom_wst_pack jsonb;
