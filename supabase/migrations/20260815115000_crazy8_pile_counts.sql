-- Crazy Eights: add the public pile sizes. ADDITIVE ONLY — safe against every client version.
--
-- This is step 1 of the split described in docs/rls-hardening.md § "Split the migration:
-- additive first, revoke last", following the Describe It precedent (20260807115000 before
-- 20260807130000). The revoke of `draw_pile`/`discard_pile` lives in the sibling file
-- 20260815120000_sec_crazy8_hide_piles.sql and must NOT be applied to production until a
-- compatible mobile build has shipped: PostgREST fails the WHOLE select with 42501 when any
-- requested column is revoked, installed builds still select the piles, and OTA cannot rescue
-- them (the config is baked into the binary at build time).
--
-- Splitting lets this half go to production immediately, so the counts exist for new clients
-- while old ones keep reading the piles.
do $$
begin
  -- Skip rather than abort where the table hasn't been created yet (a fresh environment applying
  -- migrations out of order), matching 20260803170000's guard.
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'crazy_eights_sessions'
  ) then
    raise notice 'crazy_eights_sessions not present — skipping';
    return;
  end if;

  -- Public pile sizes. Stored + generated, so they can never drift from the piles they count and
  -- no application code has to maintain them. These columns are jsonb (NOT postgres arrays), so
  -- this is jsonb_array_length, not cardinality. Both it and jsonb_typeof are immutable, which is
  -- what a generated column requires. The typeof guard keeps the count 0 rather than erroring on
  -- a null pile or a non-array value.
  alter table public.crazy_eights_sessions
    add column if not exists draw_count integer
    generated always as (
      case when jsonb_typeof(draw_pile) = 'array' then jsonb_array_length(draw_pile) else 0 end
    ) stored;

  alter table public.crazy_eights_sessions
    add column if not exists discard_count integer
    generated always as (
      case when jsonb_typeof(discard_pile) = 'array' then jsonb_array_length(discard_pile) else 0 end
    ) stored;

  -- Explicit column grants so this file is correct whether the roles currently hold TABLE-level
  -- SELECT (where a new column is covered automatically) or already hold COLUMN-level SELECT from
  -- an earlier redaction (where it is not, and the new columns would be unreadable).
  execute 'grant select (draw_count, discard_count) on public.crazy_eights_sessions to anon';
  execute 'grant select (draw_count, discard_count) on public.crazy_eights_sessions to authenticated';
end $$;
