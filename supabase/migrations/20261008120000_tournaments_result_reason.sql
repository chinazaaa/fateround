-- Tournament-parallels follow-up — add result_reason to tournaments.
--
-- Mirrors games.result_reason (Phase A). The scheduled-tournament cancel
-- endpoint sets status='finished' + result_reason='host_cancelled' so an
-- admin scan can distinguish a host-cancel from a natural finish.
--
-- Nullable — every existing row (natural finishes) has no reason set.

alter table tournaments add column if not exists result_reason text;

-- Re-grant column-level SELECT on `tournaments` so anon/authenticated can read
-- the new column. Same shape as 20260921120000_tournament_column_grants.sql —
-- required after any tournaments schema change per that migration's warning.
-- Idempotent, safe on every environment.
do $$
declare
  tournament_cols text;
  role_name text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into tournament_cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'tournaments'
     and column_name not in ('host_token', 'custom_trivia_pack');

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.tournaments from %I', role_name);
    execute format('grant select (%s) on public.tournaments to %I', tournament_cols, role_name);
  end loop;
end $$;
