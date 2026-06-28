-- Lock down elimination_events to match the Phase 5 core-gameplay RLS lockdown:
-- anon is SELECT-only; all writes go through the service role (which bypasses RLS).
--
-- The original elimination migration shipped this table with fully-permissive
-- anon insert/update/delete policies. It is written server-side in
-- src/lib/elimination.ts (the same service-role path that already writes the
-- now-locked players/games tables), so anon never needs write access here.
--
-- Idempotent: drops every existing policy, then creates a single SELECT-only read.
do $$
declare
  pol record;
begin
  execute 'alter table public.elimination_events enable row level security';
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'elimination_events'
  loop
    execute format('drop policy %I on public.elimination_events', pol.policyname);
  end loop;
  execute 'create policy elimination_events_read on public.elimination_events for select using (true)';
end $$;
