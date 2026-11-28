-- scrabble_sessions.updated_at is the optimistic-concurrency token for every compare-and-swap write
-- (persistSession plays/passes/expiry and leave: removeScrabblePlayer). The app stamps it with a
-- millisecond timestamp, so two writes in the same millisecond can store the same value and let a
-- stale writer (e.g. a leave restoring a removed seat) pass its `.eq('updated_at', ...)` check. This
-- trigger overrides the supplied value with one strictly greater than the previous version, at
-- microsecond precision, for every update. Mirrors uno_sessions_bump_version / mahjong_sessions_bump_version.
create or replace function public.scrabble_sessions_bump_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

drop trigger if exists scrabble_sessions_bump_version on public.scrabble_sessions;
create trigger scrabble_sessions_bump_version
  before update on public.scrabble_sessions
  for each row execute function public.scrabble_sessions_bump_version();
