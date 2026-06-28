-- Phase 5 RLS lockdown: rooms tables (member_code / creator_token identity model).
--
-- rooms / room_members / room_games / room_messages used permissive FOR ALL policies.
-- Lock anon to SELECT-only (all writes now go through the service role, authorized by
-- room_members.member_code for member actions and rooms.creator_token for owner actions),
-- and hide the two secret credentials from anon reads via column grants (mirrors 0122).
-- Anon SELECT + realtime stay open for the public room list, members list, chat, etc.

-- 1) RLS: SELECT-only on the four room tables (drop every existing policy, create _read).
do $$
declare
  pol record;
  tbl text;
  tables text[] := array['rooms', 'room_members', 'room_games', 'room_messages'];
begin
  foreach tbl in array tables loop
    execute format('alter table public.%I enable row level security', tbl);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = tbl loop
      execute format('drop policy %I on public.%I', pol.policyname, tbl);
    end loop;
    execute format('create policy %I on public.%I for select using (true)', tbl || '_read', tbl);
  end loop;
end $$;

-- 2) Hide secret credentials from the public roles (column-level grants): rooms.creator_token
--    and room_members.member_code. Re-grant every other column so reads/realtime keep working.
--    NOTE (same footgun as 0122): any NEW column added to rooms/room_members must also be
--    granted to anon/authenticated, or client reads of it will error (fails closed).
do $$
declare
  cols text;
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    select string_agg(quote_ident(column_name), ', ')
      into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = 'rooms' and column_name <> 'creator_token';
    execute format('revoke select on public.rooms from %I', role_name);
    execute format('grant select (%s) on public.rooms to %I', cols, role_name);

    select string_agg(quote_ident(column_name), ', ')
      into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = 'room_members' and column_name <> 'member_code';
    execute format('revoke select on public.room_members from %I', role_name);
    execute format('grant select (%s) on public.room_members to %I', cols, role_name);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted — restores permissive writes + full column reads):
-- do $$ declare tbl text; tables text[] := array['rooms','room_members','room_games','room_messages'];
-- begin
--   foreach tbl in array tables loop
--     execute format('drop policy if exists %I on public.%I', tbl||'_read', tbl);
--     execute format('create policy %I on public.%I for all using (true) with check (true)', tbl||'_all', tbl);
--   end loop;
--   grant select on public.rooms to anon, authenticated;
--   grant select on public.room_members to anon, authenticated;
-- end $$;
-- ----------------------------------------------------------------------------
