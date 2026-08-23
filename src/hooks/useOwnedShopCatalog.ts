'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { onCoinsAwarded } from '@/lib/coins/earn-events'

/**
 * Single-source-of-truth cache for the shop catalog behind every "what
 * does this profile own?" hook (useOwnedMonopolyEditions,
 * useOwnedGameThemes, and any future durable-kind hook). One in-flight
 * promise, one cross-tab BroadcastChannel + storage-event subscription,
 * one refresh-tick counter shared across every mounted consumer.
 *
 * Before this hook existed each ownership hook copied the same caching
 * machinery, so mounting both (the create page + HostThemePicker do)
 * fired parallel GET /api/shop/catalog requests, installed two
 * listeners on the 'fateround-coins-cross-tab' channel, and doubled
 * every purchase-triggered refetch.
 */

export type CatalogItem = {
  kind: string
  slug: string
  price: number
  owned: boolean
  gameType?: string
}

type CacheEntry = { key: string; promise: Promise<CatalogItem[]> }
let inflight: CacheEntry | null = null

function cacheKey(profileId: string | null, tick: number): string {
  return `${profileId ?? 'anon'}:${tick}`
}

export function invalidateSharedCatalogCache(): void {
  inflight = null
}

async function fetchSharedCatalog(profileId: string | null, tick: number): Promise<CatalogItem[]> {
  const key = cacheKey(profileId, tick)
  if (inflight && inflight.key === key) return inflight.promise
  const promise = (async () => {
    try {
      const headers = (await authHeaders()) ?? {}
      const res = await fetch('/api/shop/catalog', { headers })
      if (!res.ok) throw new Error('catalog fetch failed')
      const data = (await res.json()) as { items?: CatalogItem[] }
      return data.items ?? []
    } catch {
      // Broken catalog fetch → consumers see an empty item list and
      // fall back to their own "free items only" defaults. Drop the
      // cache entry so the next consumer / refresh tick retries
      // rather than pinning a permanently-empty list.
      if (inflight?.key === key) inflight = null
      return []
    }
  })()
  inflight = { key, promise }
  return promise
}

// Cross-tab fanout channel — same key both legacy hooks used, so
// existing tabs (a shop tab in one browser window and a lobby tab in
// another) keep interoperating without a migration window.
const CROSS_TAB_CHANNEL = 'fateround-coins-cross-tab'

let crossTabSubscribers = 0
let crossTabBc: BroadcastChannel | null = null
let crossTabStorageHandler: ((e: StorageEvent) => void) | null = null
let crossTabStopLocal: (() => void) | null = null
const crossTabListeners = new Set<() => void>()

function ensureCrossTabSubscription(): () => void {
  crossTabSubscribers += 1
  if (crossTabSubscribers === 1 && typeof window !== 'undefined') {
    const notifyAll = () => {
      for (const fn of crossTabListeners) fn()
    }
    if (typeof BroadcastChannel !== 'undefined') {
      crossTabBc = new BroadcastChannel(CROSS_TAB_CHANNEL)
      crossTabBc.onmessage = notifyAll
    }
    crossTabStorageHandler = (e: StorageEvent) => {
      if (e.key === CROSS_TAB_CHANNEL) notifyAll()
    }
    window.addEventListener('storage', crossTabStorageHandler)
    // Fan the local purchase signal (empty-lines coins-awarded) out to
    // other tabs so their listeners fire too. Only purchases (not
    // earns) refresh ownership — earn events carry ≥1 line, so the
    // empty-lines shape is the "purchase happened" marker the shop
    // client emits after purchase_item returns ok.
    crossTabStopLocal = onCoinsAwarded((coins) => {
      if ((coins?.lines?.length ?? 0) !== 0) return
      try {
        crossTabBc?.postMessage(Date.now())
        localStorage.setItem(CROSS_TAB_CHANNEL, String(Date.now()))
      } catch {
        // Private-mode storage / disabled BroadcastChannel — the
        // same-tab refresh already fires via the direct
        // onCoinsAwarded handler each hook installs.
      }
    })
  }
  return () => {
    crossTabSubscribers -= 1
    if (crossTabSubscribers === 0) {
      crossTabBc?.close()
      crossTabBc = null
      if (crossTabStorageHandler && typeof window !== 'undefined') {
        window.removeEventListener('storage', crossTabStorageHandler)
      }
      crossTabStorageHandler = null
      crossTabStopLocal?.()
      crossTabStopLocal = null
    }
  }
}

function subscribeCrossTab(listener: () => void): () => void {
  crossTabListeners.add(listener)
  const stop = ensureCrossTabSubscription()
  return () => {
    crossTabListeners.delete(listener)
    stop()
  }
}

// Same-tab coins-awarded bus. Same shared-subscription pattern as
// cross-tab above: one module-level listener fans events out to every
// mounted consumer. Round-1 had one onCoinsAwarded per consumer; N
// mounted hooks meant N setRefreshTick renders on every purchase
// (module dedup collapsed the fetch itself, but React still re-rendered
// each consumer once per subscriber).
let sameTabSubscribers = 0
let sameTabStopBus: (() => void) | null = null
const sameTabListeners = new Set<() => void>()

function ensureSameTabSubscription(): () => void {
  sameTabSubscribers += 1
  if (sameTabSubscribers === 1) {
    sameTabStopBus = onCoinsAwarded((coins) => {
      // Purchase events carry a 0-line coins-awarded payload; earn
      // events carry ≥1 line. Refresh only on purchases so a run of
      // per-round earn events doesn't slam the endpoint.
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

/**
 * Fetch the shop catalog once and expose it to every mounted consumer.
 * The returned `items` array reference is stable across renders for the
 * same (profileId, refreshTick) tuple so downstream `useMemo` deps
 * don't invalidate spuriously.
 */
export function useOwnedShopCatalog(profileId: string | null): {
  items: CatalogItem[]
  loading: boolean
  refresh: () => void
} {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => {
    invalidateSharedCatalogCache()
    setRefreshTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchSharedCatalog(profileId, refreshTick)
      .then((next) => {
        if (!cancelled) setItems(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profileId, refreshTick])

  // Same-tab + cross-tab busses: both hoisted to module level so N
  // mounted consumers share one onCoinsAwarded listener and one
  // BroadcastChannel/storage subscription instead of installing their
  // own each.
  useEffect(() => subscribeSameTab(refresh), [refresh])
  useEffect(() => subscribeCrossTab(refresh), [refresh])

  return { items, loading, refresh }
}
