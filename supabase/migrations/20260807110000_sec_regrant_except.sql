-- Shared helper for the column-level redaction pattern (audit finding H2 family).
--
-- `games.host_token` (0122), `codewords_boards.key` (20260803170000) and now
-- `describe_it_sessions.current_word` + `used_words` (20260807130000) all need the same move:
-- take the public roles' TABLE-wide SELECT away and re-grant SELECT on every column EXCEPT the
-- secret ones. Quick Draw's `current_word` is queued next (docs/rls-hardening.md), which would
-- have made it a third verbatim copy of the same `do $$` block (review NIT on PR #866).
--
-- Two things this helper does that the copied blocks did not:
--
--   1. It VALIDATES the secret column names. A typo in the excluded list ('current_wrod') in a
--      hand-written block silently re-grants the secret — the migration succeeds and the leak
--      stays open. Here it raises.
--   2. It orders the re-granted columns by `ordinal_position`, so re-running it against the same
--      table produces a stable, diffable grant list.
--
-- SECURITY: deliberately NOT `security definer`. It runs with the caller's privileges, so only a
-- role that already owns the table (i.e. the migration runner) can change grants with it —
-- `anon` calling it would just get a permission error. EXECUTE is revoked from PUBLIC anyway,
-- and `search_path` is pinned so a rogue schema on the caller's path cannot hijack the lookups.

create or replace function public.sec_regrant_except(p_table text, p_secret_cols text[])
returns void
language plpgsql
set search_path = pg_catalog
as $fn$
declare
  cols text;
  missing text;
  role_name text;
begin
  -- Skip rather than abort where the table hasn't been created yet (a fresh environment
  -- applying migrations out of order), matching the behaviour of the blocks this replaces.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = p_table
  ) then
    raise notice 'sec_regrant_except: public.% not present — skipping', p_table;
    return;
  end if;

  -- A secret column that does not exist means the caller's exclusion list is wrong, and the
  -- column it MEANT to exclude is about to be granted. Fail loudly.
  select string_agg(c, ', ') into missing
    from unnest(p_secret_cols) as c
   where not exists (
     select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_table and column_name = c
   );
  if missing is not null then
    raise exception 'sec_regrant_except: public.% has no column(s): %', p_table, missing;
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name = p_table
     and not (column_name = any (p_secret_cols));
  if cols is null then
    raise exception 'sec_regrant_except: every column of public.% is secret — refusing', p_table;
  end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke select on public.%I from %I', p_table, role_name);
    execute format('grant select (%s) on public.%I to %I', cols, p_table, role_name);
  end loop;
end
$fn$;

revoke all on function public.sec_regrant_except(text, text[]) from public;

comment on function public.sec_regrant_except(text, text[]) is
  'Revoke anon/authenticated table-wide SELECT on public.<p_table> and re-grant every column '
  'except p_secret_cols. Re-run after ADDING a column to such a table, or the new column will '
  'not be readable by the public roles.';

-- NOTE: 20260803170000 (Codewords) is already shipped and is deliberately NOT rewritten to call
-- this — an applied migration must never be edited. It should adopt the helper the next time
-- that table's grants change.
