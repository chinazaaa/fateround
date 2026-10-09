-- Rummy: add the public pile sizes. ADDITIVE ONLY — safe against every client version.
--
-- Step 1 of the split described in docs/rls-hardening.md § "Split the migration: additive first,
-- revoke last", the same shape as 20261120115000_whot_pile_counts.sql and
-- 20260815115000_crazy8_pile_counts.sql. Rummy was created after Phase 7 was written
-- (20261104120000_rummy.sql) and so never got the treatment the other card games did: its
-- session select still ships both ordered piles to the browser, which makes redacting hands
-- alone bypassable by subtraction exactly as described for Crazy Eights in
-- 20260815120000_sec_crazy8_hide_piles.sql.
--
-- The matching revoke is deliberately NOT in this file and does not exist yet. Unlike the other
-- three games there is no mobile Rummy view to drain (apps/mobile ships only the slug), so when
-- that revoke is written its only gate is the web deploy — but it still must land separately
-- and last.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'rummy_sessions'
  ) then
    raise notice 'rummy_sessions not present — skipping';
    return;
  end if;

  -- Stored + generated, so they can never drift from the piles they count. These columns are
  -- jsonb (NOT postgres arrays), so this is jsonb_array_length, not cardinality. Both it and
  -- jsonb_typeof are immutable, which a generated column requires. The typeof guard is
  -- belt-and-braces here — both piles are `jsonb NOT NULL DEFAULT '[]'` — but it keeps the
  -- count 0 rather than erroring if that ever loosens.
  alter table public.rummy_sessions
    add column if not exists draw_count integer
    generated always as (
      case when jsonb_typeof(draw_pile) = 'array' then jsonb_array_length(draw_pile) else 0 end
    ) stored;

  alter table public.rummy_sessions
    add column if not exists discard_count integer
    generated always as (
      case when jsonb_typeof(discard_pile) = 'array' then jsonb_array_length(discard_pile) else 0 end
    ) stored;

  -- Explicit, so this file is correct whether the roles hold TABLE-level SELECT (which
  -- 20261104120000_rummy.sql grants, and where a new column is covered automatically) or have
  -- since moved to COLUMN-level SELECT from a redaction (where it is not, and the new columns
  -- would be unreadable).
  execute 'grant select (draw_count, discard_count) on public.rummy_sessions to anon';
  execute 'grant select (draw_count, discard_count) on public.rummy_sessions to authenticated';
end $$;
