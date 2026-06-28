-- Track cumulative pool usage across play-again sessions (custom questions & participant rotation).
alter table games add column if not exists pool_usage jsonb not null default '{}'::jsonb;
