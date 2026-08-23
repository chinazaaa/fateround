'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  // Monotonic request id — a filter change or a fast double-tap on
  // "Load more" can start a second request before the first returns; only
  // the LATEST request may write to state, or a stale response could
  // replace fresher data (or, for loadMore, re-append the same page).
  const requestSeqRef = useRef(0)

  const fetchPage = useCallback(async (nextFilter: CoinHistoryFilter, nextOffset: number, append: boolean) => {
    const mySeq = ++requestSeqRef.current
    setLoading(true)
    try {
      const headers = await authHeaders()
      if (mySeq !== requestSeqRef.current) return
      if (!headers) {
        setSignedOut(true)
        setRows([])
        return
      }
      const res = await fetch(
        `/api/profile/coins?filter=${encodeURIComponent(nextFilter)}&offset=${nextOffset}&limit=${PAGE_SIZE}`,
        { headers }
      )
      if (mySeq !== requestSeqRef.current) return
      if (!res.ok) return
      const json = (await res.json()) as {
        profile?: { id: string } | null
        ledger?: LedgerRow[]
        hasMore?: boolean
      }
      if (mySeq !== requestSeqRef.current) return
      if (!json.profile) {
        setSignedOut(true)
        setRows([])
        return
      }
      setSignedOut(false)
      setRows((prev) => (append ? [...prev, ...(json.ledger ?? [])] : (json.ledger ?? [])))
      setHasMore(Boolean(json.hasMore))
    } finally {
      if (mySeq === requestSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Single emitter for `coin_history_viewed` — the balance-card Link
    // stopped firing its own event to avoid double-counting. Read the
    // entry point from ?entry= (`profile_card` when arrived from the card,
    // `deep_link` for a shared URL, `tab_bar` for direct in-page selection).
    let entryPoint: 'profile_card' | 'chip_longpress' | 'deep_link' = 'deep_link'
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('entry')
      if (q === 'profile_card' || q === 'chip_longpress') entryPoint = q
    }
    trackEvent(GA_EVENTS.coinHistoryViewed, { entry_point: entryPoint })
    void fetchPage('all', 0, false)
  }, [fetchPage])

  // Derive the next offset from the RENDERED row count (rather than the
  // closed-over `offset` state) — a rapid Filter→LoadMore in the same
  // event tick would otherwise use the previous render's offset (e.g. 50)
  // even though the filter change reset the list to 0 rows, silently
  // skipping the first page of the new filter. `rows.length` is the true
  // "how many rows are on screen right now."
  const changeFilter = (next: CoinHistoryFilter) => {
    setFilter(next)
    setOffset(0)
    void fetchPage(next, 0, false)
  }

  const loadMore = () => {
    const next = rows.length
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
              key === filter ? 'fr-btn--nav bg-[var(--primary)] text-[var(--on-primary,white)]' : 'fr-btn--nav'
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
