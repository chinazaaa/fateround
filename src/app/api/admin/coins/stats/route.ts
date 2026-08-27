import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Admin: shop / coin economy stats.
 *
 * A compact set of headline metrics for the `/admin/coins/stats` dashboard.
 * All queries run against Supabase with the service-role key (admins only,
 * per assertAdminRequest); nothing here is exposed to players.
 *
 * The returned windows are the last 7 and 30 days from now — an admin
 * scanning "is the shop working?" wants a same-day pulse and a rolling
 * month, not lifetime totals (which the "in circulation" figure covers
 * separately). We keep the shape small enough that the whole thing renders
 * from a single fetch; anything deeper (per-item chart, per-reason mix)
 * would earn its own endpoint.
 */

type LedgerAgg = { reason: string; sum_credited: number; sum_debited: number; row_count: number }
type TopItem = { kind: string; slug: string; purchases: number; coins_spent: number }
type DailyPoint = { day: string; earned: number; spent: number }

export async function GET(req: NextRequest) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  try {
    const [circulation, purchasers, totalProfiles, ledger7d, ledger30d, topItems, daily] = await Promise.all([
      // Total coins in circulation — the "money supply". A one-time backfill
      // seeded this so we care mostly about the rate of change; still, the
      // absolute is useful to size the economy against a cash-pack price
      // point later.
      supabase.rpc('admin_coins_circulation'),
      // Distinct profiles who have purchased at least one shop item. Uses
      // the reason='shop_purchase' rows in coin_ledger so we count actual
      // spend, not backfilled owned_* rows (grandfathered content).
      supabase.rpc('admin_coins_distinct_purchasers'),
      supabase.rpc('admin_coins_total_profiles'),
      supabase.rpc('admin_coins_ledger_summary', { p_since_days: 7 }),
      supabase.rpc('admin_coins_ledger_summary', { p_since_days: 30 }),
      supabase.rpc('admin_coins_top_items', { p_since_days: 30, p_limit: 20 }),
      supabase.rpc('admin_coins_daily_flow', { p_since_days: 14 }),
    ])

    for (const step of [circulation, purchasers, totalProfiles, ledger7d, ledger30d, topItems, daily]) {
      if (step.error) throw step.error
    }

    return NextResponse.json({
      circulation: Number(circulation.data ?? 0),
      purchasers: Number(purchasers.data ?? 0),
      totalProfiles: Number(totalProfiles.data ?? 0),
      window7d: (ledger7d.data ?? []) as LedgerAgg[],
      window30d: (ledger30d.data ?? []) as LedgerAgg[],
      topItems: (topItems.data ?? []) as TopItem[],
      daily: (daily.data ?? []) as DailyPoint[],
    })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('admin/coins/stats', err) }, { status: 500 })
  }
}
