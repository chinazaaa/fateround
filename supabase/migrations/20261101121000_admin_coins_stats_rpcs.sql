-- Admin shop-stats RPCs. All SECURITY DEFINER + revoked from public / anon /
-- authenticated: the /api/admin/coins/stats route uses the service-role key,
-- and no client-side surface should ever be able to enumerate the economy.
-- Idempotent — CREATE OR REPLACE + REVOKE both re-run cleanly.

-- Total coins across all profiles ("money supply"). Small return so a plain
-- bigint keeps the client shape stable.
create or replace function admin_coins_circulation()
returns bigint
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(coins), 0)::bigint from profiles;
$$;

-- Total profiles — denominator for the purchase-conversion percentage.
create or replace function admin_coins_total_profiles()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint from profiles;
$$;

-- Distinct profiles that have posted at least one shop_purchase to
-- coin_ledger. Backfilled owned_* rows do NOT count — this is a spend
-- metric, not an ownership metric.
create or replace function admin_coins_distinct_purchasers()
returns bigint
language sql
security definer
set search_path = public
as $$
  select count(distinct profile_id)::bigint
    from coin_ledger
   where reason = 'shop_purchase';
$$;

-- Per-reason breakdown over the last N days. `sum_credited` = positive
-- deltas (earning + refunds); `sum_debited` = absolute value of negative
-- deltas (purchases). Split so the same row shape works for earn reasons
-- (all credit) and spend reasons (all debit) without the client having to
-- interpret signs.
create or replace function admin_coins_ledger_summary(p_since_days integer)
returns table (reason text, sum_credited bigint, sum_debited bigint, row_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    reason::text,
    coalesce(sum(case when delta > 0 then delta else 0 end), 0)::bigint as sum_credited,
    coalesce(sum(case when delta < 0 then -delta else 0 end), 0)::bigint as sum_debited,
    count(*)::bigint as row_count
    from coin_ledger
   where created_at >= now() - make_interval(days => greatest(p_since_days, 1))
   group by reason
   order by row_count desc;
$$;

-- Top-selling shop items over the last N days. `kind` and `slug` are
-- decoded from ref_id, which for shop_purchase rows is `${kind}:${slug}`
-- (see src/app/api/shop/purchase/route.ts). Anything that doesn't fit
-- that shape is bucketed as ('unknown', ref_id) so no rows silently drop.
create or replace function admin_coins_top_items(p_since_days integer, p_limit integer)
returns table (kind text, slug text, purchases bigint, coins_spent bigint)
language sql
security definer
set search_path = public
as $$
  select
    split_part(coalesce(ref_id, 'unknown:'), ':', 1)::text as kind,
    substring(coalesce(ref_id, ''), position(':' in coalesce(ref_id, ':')) + 1)::text as slug,
    count(*)::bigint as purchases,
    coalesce(sum(-delta), 0)::bigint as coins_spent
    from coin_ledger
   where reason = 'shop_purchase'
     and created_at >= now() - make_interval(days => greatest(p_since_days, 1))
     and ref_id is not null
   group by kind, slug
   order by purchases desc, coins_spent desc
   limit greatest(p_limit, 1);
$$;

-- Daily earned vs spent over the last N days, one row per day (missing
-- days omitted — the client fills gaps if it needs a sparkline).
create or replace function admin_coins_daily_flow(p_since_days integer)
returns table (day date, earned bigint, spent bigint)
language sql
security definer
set search_path = public
as $$
  select
    date_trunc('day', created_at)::date as day,
    coalesce(sum(case when delta > 0 and reason <> 'refund' then delta else 0 end), 0)::bigint as earned,
    coalesce(sum(case when reason = 'shop_purchase' then -delta else 0 end), 0)::bigint as spent
    from coin_ledger
   where created_at >= now() - make_interval(days => greatest(p_since_days, 1))
   group by day
   order by day asc;
$$;

-- Lock down every RPC — the /api route calls them via the service role.
revoke all on function admin_coins_circulation() from public, anon, authenticated;
revoke all on function admin_coins_total_profiles() from public, anon, authenticated;
revoke all on function admin_coins_distinct_purchasers() from public, anon, authenticated;
revoke all on function admin_coins_ledger_summary(integer) from public, anon, authenticated;
revoke all on function admin_coins_top_items(integer, integer) from public, anon, authenticated;
revoke all on function admin_coins_daily_flow(integer) from public, anon, authenticated;
