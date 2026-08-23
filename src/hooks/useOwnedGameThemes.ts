'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { useProfile } from '@/hooks/useProfile'
import { onCoinsAwarded } from '@/lib/coins/earn-events'

/**
 * Which per-game visual themes (Neon Whot, Wooden Ludo, …) the current
 * profile can host for `gameType`. Mirrors `useOwnedMonopolyEditions`:
 * the shop catalog is the single source of truth for both the price and
 * the ownership flag, so a fresh purchase in another tab lights up the
 * lobby picker without a hard reload.
 *
 * Free themes (`price_coins = 0` in `game_themes`) are always included;
 * paid themes appear only after the profile owns them. The always-free
 * `default` theme every game ships with is NOT surfaced here — it isn't
 * a `game_themes` row. Pickers add it themselves.
 */
type CacheEntry = { key: string; promise: Promise<Set<string>> }
let inflight: CacheEntry | null = null

function cacheKey(profileId: string | null, tick: number): string {
  return `${profileId ?? 'anon'}:${tick}`
}

function invalidateGameThemesCache(): void {
  inflight = null
}

async function fetchAvailable(profileId: string | null, tick: number): Promise<Map<string, Set<string>>> {
  const key = cacheKey(profileId, tick)
  // The Promise cached below resolves to a flat set; we bucket per-gameType
  // on read so a single fetch feeds every mounted consumer regardless of
  // which game they picker for.
  if (!inflight || inflight.key !== key) {
    const promise = (async () => {
      try {
        const headers = (await authHeaders()) ?? {}
        const res = await fetch('/api/shop/catalog', { headers })
        if (!res.ok) throw new Error('catalog fetch failed')
        const data = (await res.json()) as {
          items: { kind: string; slug: string; price: number; owned: boolean; gameType?: string }[]
        }
        const set = new Set<string>()
        for (const item of data.items ?? []) {
          if (item.kind !== 'theme') continue
          if (!item.gameType) continue
          // Encode gameType into the set key so the reader can bucket
          // without a second pass over the catalog. Same wire cost.
          if (item.owned || item.price === 0) set.add(`${item.gameType}:${item.slug}`)
        }
        return set
      } catch {
        if (inflight?.key === key) inflight = null
        return new Set<string>()
      }
    })()
    inflight = { key, promise }
  }
  const flat = await inflight.promise
  const byGame = new Map<string, Set<string>>()
  for (const combined of flat) {
    const idx = combined.indexOf(':')
    if (idx < 0) continue
    const g = combined.slice(0, idx)
    const s = combined.slice(idx + 1)
    const bucket = byGame.get(g) ?? new Set<string>()
    bucket.add(s)
    byGame.set(g, bucket)
  }
  return byGame
}

export function useOwnedGameThemes(gameType: string | null | undefined): {
  /** Theme slugs (from game_themes) the host may pick for this game type. */
  available: Set<string>
  loading: boolean
  refresh: () => void
} {
  const { profile } = useProfile()
  const profileId = profile?.id ?? null
  const [buckets, setBuckets] = useState<Map<string, Set<string>>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => {
    invalidateGameThemesCache()
    setRefreshTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAvailable(profileId, refreshTick)
      .then((map) => {
        if (!cancelled) setBuckets(map)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileId, refreshTick])

  // Same-tab: shop purchases emit an empty-lines coins-awarded payload
  // (see ShopClient.confirmPurchase). Coin-earn events carry ≥1 line,
  // so filter to the purchase signal to avoid a refetch storm on every
  // round win.
  useEffect(
    () =>
      onCoinsAwarded((coins) => {
        if ((coins?.lines?.length ?? 0) === 0) refresh()
      }),
    [refresh]
  )

  // Cross-tab: the shared coins-awarded bus doesn't cross document
  // boundaries, so mirror the useOwnedMonopolyEditions pattern —
  // BroadcastChannel + localStorage `storage`-event fallback keep two
  // browser tabs in sync when either buys a theme.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const CHANNEL = 'fateround-coins-cross-tab'
    let bc: BroadcastChannel | null = null
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CHANNEL)
      bc.onmessage = () => refresh()
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHANNEL) refresh()
    }
    window.addEventListener('storage', onStorage)
    const stopLocal = onCoinsAwarded((coins) => {
      if ((coins?.lines?.length ?? 0) !== 0) return
      try {
        bc?.postMessage(Date.now())
        localStorage.setItem(CHANNEL, String(Date.now()))
      } catch {
        // Private mode: same-tab refresh above already fired.
      }
    })
    return () => {
      bc?.close()
      window.removeEventListener('storage', onStorage)
      stopLocal()
    }
  }, [refresh])

  const available = gameType ? (buckets.get(gameType) ?? new Set<string>()) : new Set<string>()
  return { available, loading, refresh }
}
