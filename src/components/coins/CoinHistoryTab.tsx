'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { COIN_HISTORY_FILTERS, COIN_REASON_LABEL, type CoinHistoryFilter } from '@/lib/coins/reasons'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'
import type { GameType } from '@/types'
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

/** Pretty game name from a first-mode bonus ref_id (format `first_mode:{gameType}`).
 *  Falls back to the raw slug (title-cased) if the game type isn't in the
 *  catalog, so a retired game still reads sensibly. */
function firstModeBonusGameLabel(refId: string | null): string | null {
  if (!refId?.startsWith('first_mode:')) return null
  const slug = refId.slice('first_mode:'.length)
  const config = GAME_TYPE_CONFIG[slug as GameType]
  if (config?.label) return config.label
  return slug ? slug.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null
}

const PURCHASE_KIND_LABELS: Record<string, string> = {
  frame: 'Avatar frame',
  name_color: 'Name color',
  animation: 'Winner animation',
  card_template: 'Card template',
  streak_freeze: 'Streak freeze',
  theme: 'Game theme',
  edition: 'Edition',
  library_pack: 'Library pack',
  extra_bot: 'Extra bot',
}

/** Human-readable purchase description from a shop_purchase ref_id.
 *
 *  Durable purchases: `<kind>:<slug>` (e.g. `animation:winner-anim-confetti`)
 *    → "Winner animation · winner-anim-confetti".
 *
 *  Extra bot (post 20261103120000_extra_bot_ref_id_with_game):
 *    `extra_bot:<game_type>:<game_code>:<player_uuid>`
 *    → "Extra bot · Whot TXVHTD".
 *
 *  Legacy extra bot (pre-migration rows):
 *    `extra_bot:<player_uuid>`
 *    → "Extra bot" (drop the UUID; it wasn't useful and rendered ugly).
 */
function shopPurchaseLabel(refId: string | null): string | null {
  if (!refId) return null
  const colon = refId.indexOf(':')
  if (colon <= 0) return null
  const kind = refId.slice(0, colon)
  const rest = refId.slice(colon + 1)
  if (!rest) return null
  const kindLabel = PURCHASE_KIND_LABELS[kind] ?? kind

  if (kind === 'extra_bot') {
    // New: <game_type>:<game_code>:<player_uuid>. Old: <player_uuid>.
    const parts = rest.split(':')
    if (parts.length >= 3) {
      const gameType = parts[0]
      const gameCode = parts[1]
      const gameName = GAME_TYPE_CONFIG[gameType as GameType]?.label ?? gameType
      return `${kindLabel} · ${gameName} ${gameCode}`
    }
    // Old-format row (raw UUID) — hide the UUID; the "when" column is the
    // primary way to distinguish these anyway.
    return kindLabel
  }

  return `${kindLabel} · ${rest}`
}

function describeRow(row: LedgerRow, gameTypeByRefId: Record<string, string>): string {
  if (row.reason === 'admin_adjustment') return 'Adjustment by support'
  if (row.reason === 'first_mode_bonus') {
    const game = firstModeBonusGameLabel(row.ref_id)
    return game ? `First-time bonus · ${game}` : (COIN_REASON_LABEL[row.reason] ?? row.reason)
  }
  if (row.reason === 'shop_purchase') {
    // Attach what was bought so a wall of "Shop purchase" rows becomes
    // "Winner animation · confetti", "Edition · america", etc. — the
    // player can eyeball spend without cross-referencing the shop.
    const purchase = shopPurchaseLabel(row.ref_id)
    return purchase ? `Shop · ${purchase}` : (COIN_REASON_LABEL[row.reason] ?? row.reason)
  }
  const base = COIN_REASON_LABEL[row.reason] ?? row.reason
  if (row.reason === 'win' && row.ref_id) {
    const gameType = gameTypeByRefId[row.ref_id]
    const label = gameType ? (GAME_TYPE_CONFIG[gameType as GameType]?.label ?? gameType) : null
    if (label) return `${base} · ${label}`
  }
  return base
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
  const [gameTypeByRefId, setGameTypeByRefId] = useState<Record<string, string>>({})
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
        gameTypeByRefId?: Record<string, string>
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
      setGameTypeByRefId((prev) =>
        append ? { ...prev, ...(json.gameTypeByRefId ?? {}) } : (json.gameTypeByRefId ?? {})
      )
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
                    <td className="py-2 pr-2 text-body">{describeRow(row, gameTypeByRefId)}</td>
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
