import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchShopCatalog, type ShopItem } from '@/lib/coins/shop-api'
import { onCoinsAwarded } from '@/lib/coins/earn-events'

/**
 * Mobile mirror of `src/hooks/useOwnedShopCatalog.ts`.
 *
 * Same single-in-flight-per-tick pattern feeding the ownership hooks
 * (`useOwnedGameThemes`, `useOwnedMonopolyEditions`). The web hook adds
 * a BroadcastChannel + storage-event cross-tab fanout — that layer is
 * meaningless on a phone (single app process, no other tabs) and is
 * dropped here. The in-process `DeviceEventEmitter` "coins-awarded"
 * subscription is still module-level so N mounted consumers share one
 * listener.
 *
 * Uses no explicit profileId — the mobile app has no shared `useProfile`
 * hook. Sign-in/out is rare on mobile; when it happens the caller
 * (typically a settings sheet) explicitly calls `refresh()` after
 * updating identity. Purchases inside the mobile shop fire an empty-lines
 * `emitCoinsAwarded` which the module listener below picks up and
 * fans out to every mounted consumer.
 */

export type CatalogItem = {
  kind: string
  slug: string
  price: number
  owned: boolean
  gameType?: string
}

type CacheEntry = { tick: number; promise: Promise<CatalogItem[]> }
let inflight: CacheEntry | null = null

export function invalidateSharedCatalogCache(): void {
  inflight = null
}

async function fetchShared(tick: number): Promise<CatalogItem[]> {
  if (inflight && inflight.tick === tick) return inflight.promise
  const promise = (async () => {
    const catalog = await fetchShopCatalog()
    if (!catalog) {
      // Fetch failed — drop the cache entry so the next consumer /
      // refresh retries rather than pinning an empty list.
      if (inflight?.tick === tick) inflight = null
      return [] as CatalogItem[]
    }
    return catalog.items.map((i: ShopItem) => ({
      kind: i.kind,
      slug: i.slug,
      price: i.price,
      owned: i.owned,
      gameType: i.gameType,
    }))
  })()
  inflight = { tick, promise }
  return promise
}

// Same-tab coins-awarded bus. Mirrors the web hook's module-level
// listener; only fires for purchase events (empty-lines payload). Earn
// events (lines.length > 0) don't affect ownership and are ignored.
let sameTabSubscribers = 0
let sameTabStopBus: (() => void) | null = null
const sameTabListeners = new Set<() => void>()

function ensureSameTabSubscription(): () => void {
  sameTabSubscribers += 1
  if (sameTabSubscribers === 1) {
    sameTabStopBus = onCoinsAwarded((coins) => {
      if ((coins?.lines?.length ?? 0) !== 0) return
      for (const fn of sameTabListeners) fn()
    })
  }
  return () => {
    sameTabSubscribers -= 1
    if (sameTabSubscribers === 0) {
      sameTabStopBus?.()
      sameTabStopBus = null
    }
  }
}

function subscribeSameTab(listener: () => void): () => void {
  sameTabListeners.add(listener)
  const stop = ensureSameTabSubscription()
  return () => {
    sameTabListeners.delete(listener)
    stop()
  }
}

export function useOwnedShopCatalog(): {
  items: CatalogItem[]
  loading: boolean
  refresh: () => void
} {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)
  const initialisedRef = useRef(false)

  const refresh = useCallback(() => {
    invalidateSharedCatalogCache()
    setRefreshTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const isFirstLoad = !initialisedRef.current
    if (isFirstLoad) setLoading(true)
    fetchShared(refreshTick)
      .then((next) => {
        if (!cancelled) setItems(next)
      })
      .finally(() => {
        if (cancelled) return
        if (isFirstLoad) {
          setLoading(false)
          initialisedRef.current = true
        }
      })
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  useEffect(() => subscribeSameTab(refresh), [refresh])

  return { items, loading, refresh }
}
