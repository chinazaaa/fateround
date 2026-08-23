'use client'

import { useEffect, useState } from 'react'

/**
 * Admin: shop / coin economy stats.
 *
 * Not a real dashboarding tool — just the "is the shop working?" pulse we
 * need before wiring proper analytics dashboards. Every metric comes from
 * a single fetch of /api/admin/coins/stats, which fans out to the small
 * set of SECURITY DEFINER RPCs added in
 * 20261101121000_admin_coins_stats_rpcs.sql. Nothing here touches personal
 * data — aggregates only, no profile ids.
 */

type LedgerAgg = { reason: string; sum_credited: number; sum_debited: number; row_count: number }
type TopItem = { kind: string; slug: string; purchases: number; coins_spent: number }
type DailyPoint = { day: string; earned: number; spent: number }
type Stats = {
  circulation: number
  purchasers: number
  totalProfiles: number
  window7d: LedgerAgg[]
  window30d: LedgerAgg[]
  topItems: TopItem[]
  daily: DailyPoint[]
}

const REASON_LABELS: Record<string, string> = {
  win: 'Won a round',
  daily_challenge: 'Daily challenge',
  streak_multiplier: 'Streak bonus',
  tournament_placement: 'Tournament placement',
  host_bounty: 'Host bounty',
  first_mode_bonus: 'First-time mode bonus',
  launch_grant_v1: 'Launch bonus',
  welcome_v1: 'Welcome bonus',
  guest_migration: 'Guest play migrated',
  admin_adjustment: 'Support / admin',
  shop_purchase: 'Shop purchase',
  refund: 'Refund',
}

const KIND_LABELS: Record<string, string> = {
  frame: 'Avatar frame',
  name_color: 'Name color',
  animation: 'Winner animation',
  card_template: 'Card template',
  streak_freeze: 'Streak freeze',
  theme: 'Game theme',
  edition: 'Edition',
  library_pack: 'Library pack',
  extra_bot: 'Extra bot (inline)',
  unknown: 'Other',
}

function pct(n: number, d: number): string {
  if (!d) return '—'
  return `${((n / d) * 100).toFixed(1)}%`
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4 space-y-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-faint">{title}</p>
      {children}
    </div>
  )
}

function StatValue({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-black tabular-nums text-body">{value}</p>
      {hint && <p className="text-[11px] text-faint mt-0.5">{hint}</p>}
    </div>
  )
}

export default function CoinStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/coins/stats')
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data?.error ?? 'Failed to load stats')
        } else {
          setStats(data as Stats)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="p-4 text-sm text-muted">Loading shop stats…</p>
  }
  if (error || !stats) {
    return <p className="p-4 text-sm text-red-500">Couldn&apos;t load stats — {error ?? 'unknown error'}</p>
  }

  const earned7d = stats.window7d
    .filter((r) => r.reason !== 'shop_purchase' && r.reason !== 'admin_adjustment' && r.reason !== 'refund')
    .reduce((sum, r) => sum + r.sum_credited, 0)
  const spent7d = stats.window7d.filter((r) => r.reason === 'shop_purchase').reduce((sum, r) => sum + r.sum_debited, 0)
  const earned30d = stats.window30d
    .filter((r) => r.reason !== 'shop_purchase' && r.reason !== 'admin_adjustment' && r.reason !== 'refund')
    .reduce((sum, r) => sum + r.sum_credited, 0)
  const spent30d = stats.window30d
    .filter((r) => r.reason === 'shop_purchase')
    .reduce((sum, r) => sum + r.sum_debited, 0)

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Shop stats</h1>
        <p className="mt-1 text-sm text-muted">
          Server-authoritative rollups from <code>coin_ledger</code>. Data is real-time — no caching.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card title="Coins in circulation">
          <StatValue label="Total balance across all profiles" value={fmt(stats.circulation)} />
        </Card>
        <Card title="Purchase conversion">
          <StatValue
            label={`${fmt(stats.purchasers)} of ${fmt(stats.totalProfiles)} profiles`}
            value={pct(stats.purchasers, stats.totalProfiles)}
            hint="Profiles with ≥1 shop_purchase ledger row"
          />
        </Card>
        <Card title="Last 7 days">
          <StatValue label="Earned" value={fmt(earned7d)} />
          <StatValue label="Spent" value={fmt(spent7d)} />
        </Card>
        <Card title="Last 30 days">
          <StatValue label="Earned" value={fmt(earned30d)} />
          <StatValue label="Spent" value={fmt(spent30d)} />
        </Card>
      </div>

      <Card title="Top items — last 30 days">
        {stats.topItems.length === 0 ? (
          <p className="text-sm text-muted">No purchases in the last 30 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="text-left py-1">Item</th>
                  <th className="text-left py-1">Category</th>
                  <th className="text-right py-1">Purchases</th>
                  <th className="text-right py-1">Coins spent</th>
                </tr>
              </thead>
              <tbody>
                {stats.topItems.map((item) => (
                  <tr key={`${item.kind}:${item.slug}`} className="border-t border-[var(--border)]">
                    <td className="py-1.5 font-medium text-body">{item.slug}</td>
                    <td className="py-1.5 text-muted">{KIND_LABELS[item.kind] ?? item.kind}</td>
                    <td className="py-1.5 tabular-nums text-right">{fmt(item.purchases)}</td>
                    <td className="py-1.5 tabular-nums text-right">🪙 {fmt(item.coins_spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card title="Earned by reason — 30 days">
          <ReasonTable rows={stats.window30d} column="credited" />
        </Card>
        <Card title="Spent by reason — 30 days">
          <ReasonTable rows={stats.window30d} column="debited" />
        </Card>
      </div>

      <Card title="Daily flow — last 14 days">
        {stats.daily.length === 0 ? (
          <p className="text-sm text-muted">No ledger activity in the last 14 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="text-left py-1">Day</th>
                  <th className="text-right py-1">Earned</th>
                  <th className="text-right py-1">Spent</th>
                  <th className="text-right py-1">Net</th>
                </tr>
              </thead>
              <tbody>
                {stats.daily.map((row) => (
                  <tr key={row.day} className="border-t border-[var(--border)]">
                    <td className="py-1.5 font-medium text-body">{row.day}</td>
                    <td className="py-1.5 tabular-nums text-right">+{fmt(row.earned)}</td>
                    <td className="py-1.5 tabular-nums text-right">-{fmt(row.spent)}</td>
                    <td className="py-1.5 tabular-nums text-right">{fmt(row.earned - row.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function ReasonTable({ rows, column }: { rows: LedgerAgg[]; column: 'credited' | 'debited' }) {
  // Show only rows that actually have a value on the column being displayed
  // — an "earned by reason" table listing shop_purchase with 0 credited is
  // noise. Sort desc by that column.
  const filtered = rows
    .filter((r) => (column === 'credited' ? r.sum_credited > 0 : r.sum_debited > 0))
    .sort((a, b) => (column === 'credited' ? b.sum_credited - a.sum_credited : b.sum_debited - a.sum_debited))
  if (filtered.length === 0) {
    return <p className="text-sm text-muted">Nothing in this window yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wide text-faint">
          <tr>
            <th className="text-left py-1">Reason</th>
            <th className="text-right py-1">Coins</th>
            <th className="text-right py-1">Rows</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.reason} className="border-t border-[var(--border)]">
              <td className="py-1.5 font-medium text-body">{REASON_LABELS[row.reason] ?? row.reason}</td>
              <td className="py-1.5 tabular-nums text-right">
                🪙 {fmt(column === 'credited' ? row.sum_credited : row.sum_debited)}
              </td>
              <td className="py-1.5 tabular-nums text-right text-muted">{fmt(row.row_count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
