-- Add the four tables the client subscribes to, but that were never put in the realtime publication.
--
-- A Supabase Realtime channel is all-or-nothing: if ONE `postgres_changes` binding names a table
-- that is not in the `supabase_realtime` publication, the server answers "Unable to subscribe to
-- changes with given parameters" and the WHOLE channel delivers nothing. `useGameChannel` puts
-- `games`, `players`, `rounds`, `votes`, ... AND `participants`, `confessions` and
-- `hot_seat_submissions` on one channel (`game-player-<code>`), so on production every one of those
-- events was dead. Players only found out the game had started when a polling fallback fired,
-- 6-20 seconds later (measured on fateround.com with four players in every game type).
-- `anonymous_room_bans` has the same problem for the anonymous-room channel.
--
-- Found by probing production Realtime one table at a time: every other table the app subscribes to
-- is already published; these four were the only ones rejected (besides the three mafia_* tables,
-- which were removed on purpose by 20260708180500 / 20260803180100 and are not touched here).
--
-- Not a new exposure: each table already has a SELECT-only `using (true)` policy
-- (20260628132823_rls_lockdown_core_gameplay, 0017_anonymous_room_bans) for exactly this purpose
-- ("Anon SELECT stays open ... realtime subscriptions"), and Realtime applies the same RLS, so
-- subscribers can see no row they could not already read over REST.
--
-- Additive and idempotent: skips a table that is missing or already published.

do $$
declare
  tbl text;
begin
  foreach tbl in array array['participants', 'confessions', 'hot_seat_submissions', 'anonymous_room_bans'] loop
    if to_regclass('public.' || tbl) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
