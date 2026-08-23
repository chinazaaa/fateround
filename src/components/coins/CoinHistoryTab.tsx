'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { COIN_HISTORY_FILTERS, COIN_REASON_LABEL, type CoinHistoryFilter } from '@/lib/coins/reasons'
import { trackEvent, GA_EVENTS } from '@/lib/analytics'

type LedgerRow = {
  id: string
  delta: number
  balance_after: number
  reason: string
  ref_id: string | null
  admin_category: string | null
  admin_note: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const PAGE_SIZE = 50

function describeRow(row: LedgerRow): string {
  if (row.reason === 'admin_adjustment') return 'Adjustment by support'
  return COIN_REASON_LABEL[row.reason] ?? row.reason
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

/**
 * Coin History tab on the profile page (plan §"UI surfaces" → "Ledger / Coin
 * History"). Table with date · description · amount · balance after.
 * Filterable by reason. Paginated at 50 rows.
 *
 * A signed-out player sees an empty state.
 */
export function CoinHistoryTab() {
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [filter, setFilter] = useState<CoinHistoryFilter>('all')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [signedOut, setSignedOut] = useState(false)

  const fetchPage = useCallback(
    async (nextFilter: CoinHistoryFilter, nextOffset: number, append: boolean) => {
      setLoading(true)
      try {
        const headers = await authHeaders()
        if (!headers) {
          setSignedOut(true)
          setRows([])
          return
        }
        const res = await fetch(
          `/api/profile/coins?filter=${encodeURIComponent(nextFilter)}&offset=${nextOffset}&limit=${PAGE_SIZE}`,
          { headers }
        )
        if (!res.ok) return
        const json = (await res.json()) as {
          profile?: { id: string } | null
          ledger?: LedgerRow[]
          hasMore?: boolean
        }
        if (!json.profile) {
          setSignedOut(true)
          setRows([])
          return
        }
        setSignedOut(false)
        setRows((prev) => (append ? [...prev, ...(json.ledger ?? [])] : json.ledger ?? []))
        setHasMore(Boolean(json.hasMore))
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    trackEvent(GA_EVENTS.coinHistoryViewed, { entry_point: 'profile_card' })
    void fetchPage('all', 0, false)
  }, [fetchPage])

  const changeFilter = (next: CoinHistoryFilter) => {
    setFilter(next)
    setOffset(0)
    void fetchPage(next, 0, false)
  }

  const loadMore = () => {
    const next = offset + PAGE_SIZE
    setOffset(next)
    void fetchPage(filter, next, true)
  }

  if (signedOut) {
    return <p className="text-muted text-sm">Save your profile to start earning coins.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(COIN_HISTORY_FILTERS) as CoinHistoryFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => changeFilter(key)}
            className={
              key === filter
                ? 'fr-btn--nav bg-[var(--primary)] text-[var(--on-primary,white)]'
                : 'fr-btn--nav'
            }
          >
            {COIN_HISTORY_FILTERS[key]}
          </button>
        ))}
      </div>

      {rows.length === 0 && !loading ? (
        <p className="text-muted text-sm">No coin activity yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-faint text-[11px] uppercase tracking-wider">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Description</th>
                <th className="py-2 pr-2 text-right">Amount</th>
                <th className="py-2 pr-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const positive = row.delta >= 0
                return (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-2 text-muted tabular-nums">{formatDate(row.created_at)}</td>
                    <td className="py-2 pr-2 text-body">{describeRow(row)}</td>
                    <td
                      className={
                        positive
                          ? 'py-2 pr-2 text-right font-bold tabular-nums text-[var(--primary)]'
                          : 'py-2 pr-2 text-right font-bold tabular-nums text-[var(--danger,red)]'
                      }
                    >
                      {positive ? `+${row.delta.toLocaleString()}` : row.delta.toLocaleString()}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums text-body">
                      {Number(row.balance_after).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <button type="button" onClick={loadMore} disabled={loading} className="fr-btn--nav">
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
