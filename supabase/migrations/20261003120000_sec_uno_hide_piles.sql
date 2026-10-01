-- UNO: add the public pile sizes. ADDITIVE ONLY — safe against every client version.
--
-- Step 1 of the split in docs/rls-hardening.md § "Split the migration: additive first, revoke
-- last", matching 20260815115000_crazy8_pile_counts.sql and 20261120115000_whot_pile_counts.sql.
-- The revoke of `draw_pile`/`discard_pile` is the sibling
-- 20261121120000_sec_uno_hide_piles_revoke.sql and must NOT reach production until a compatible
-- mobile build has shipped.
--
-- Splitting matters for the dev -> main promotion: this half can go to production immediately, so
-- the counts exist for new clients while installed builds keep reading the piles. Previously this
-- file did BOTH, which meant the safe half could not ship without the half that breaks every
-- installed build.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'uno_sessions'
  ) then
    raise notice 'uno_sessions not present — skipping';
    return;
  end if;

  -- Public pile sizes. Stored + generated, so they can never drift from the piles they count and
  -- no application code has to maintain them. These columns are jsonb (NOT postgres arrays), so
  -- this is jsonb_array_length, not cardinality. Both it and jsonb_typeof are immutable, which is
  -- what a generated column requires. The typeof guard keeps the count 0 rather than erroring on
  -- a null pile or a non-array value.
  alter table public.uno_sessions
    add column if not exists draw_count integer
    generated always as (
      case when jsonb_typeof(draw_pile) = 'array' then jsonb_array_length(draw_pile) else 0 end
    ) stored;

  alter table public.uno_sessions
    add column if not exists discard_count integer
    generated always as (
      case when jsonb_typeof(discard_pile) = 'array' then jsonb_array_length(discard_pile) else 0 end
    ) stored;

  -- Explicit, so this file is correct whether the roles hold TABLE-level SELECT (where a new
  -- column is covered automatically) or already hold COLUMN-level SELECT from an earlier
  -- redaction (where it is not, and the new columns would be unreadable).
  execute 'grant select (draw_count, discard_count) on public.uno_sessions to anon';
  execute 'grant select (draw_count, discard_count) on public.uno_sessions to authenticated';
end $$;
