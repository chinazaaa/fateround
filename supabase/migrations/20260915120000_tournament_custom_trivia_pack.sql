-- Optional shared trivia question pack for a round-robin tournament: when a host
-- uploads a CSV or generates a pack with AI at tournament-create time, it's
-- stored here and every planned Trivia round in this tournament draws from it
-- (with the existing pool_usage dedup carrying seen questions across rounds).
-- Null / empty = fall back to the platform question bank, same as before.
-- Never exposed in the public GET response — leaking a CSV of pre-set answers
-- to any caller with a tournament code would spoil every trivia round.
alter table tournaments add column if not exists custom_trivia_pack jsonb;
