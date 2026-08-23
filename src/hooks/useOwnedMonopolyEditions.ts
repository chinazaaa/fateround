'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { useProfile } from '@/hooks/useProfile'
import { onCoinsAwarded } from '@/lib/coins/earn-events'
import { FREE_MONOPOLY_EDITION_SLUGS, MONOPOLY_THEME_TO_EDITION } from '@/lib/coins/editions'

// Re-export for existing callers that already reach into this hook module.
// The canonical maps live in src/lib/coins/editions.ts (single source of
// truth for theme ↔ edition_slug so new editions land in one file).
export { MONOPOLY_THEME_TO_EDITION, FREE_MONOPOLY_EDITION_SLUGS }
export { MONOPOLY_THEME_TO_EDITION as MONOPOLY_THEME_TO_EDITION_SLUG }

/**
 * Module-level in-flight cache so N mounted consumers of this hook (create
 * page + HostThemePicker + any future picker) share one fetch per (profileId,
 * refreshTick) tuple. Without this, opening the create page fired one catalog
 * fetch per component, and every purchase event fired another N.
 *
 * The cache is a Promise, not a value — a second consumer that mounts while
 * the first fetch is still in flight awaits the same promise instead of
 * kicking off a duplicate. `invalidateEditionsCache()` drops the entry so
 * the next consumer refetches (sign-in, purchase, manual refresh).
 */
type CacheEntry = { key: string; promise: Promise<Set<string>> }
let inflight: CacheEntry | null = null

function cacheKey(profileId: string | null, tick: number): string {
  return `${profileId ?? 'anon'}:${tick}`
}

function invalidateEditionsCache(): void {
  inflight = null
}

async function fetchAvailable(profileId: string | null, tick: number): Promise<Set<string>> {
  const key = cacheKey(profileId, tick)
  if (inflight && inflight.key === key) return inflight.promise
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
        if (item.kind !== 'edition') continue
        if (item.gameType !== 'monopoly') continue
        if (item.owned || item.price === 0) set.add(item.slug)
      }
      return set
    } catch {
      // Broken catalog fetch → "no paid editions unlocked". Free editions
      // still show via the always-available fallback below. Drop the cache
      // entry so the next consumer / refresh tick retries rather than
      // pinning a permanently-empty set for the whole session.
      if (inflight?.key === key) inflight = null
      return new Set<string>()
    }
  })()
  inflight = { key, promise }
  return promise
}

/**
 * Which Monopoly editions the current profile can host. Free editions
 * (price_coins = 0 in `game_editions`, i.e. every grandfathered pre-Phase-4
 * edition) are always included; paid editions appear only after the
 * profile purchases them.
 *
 * Backing the picker gate on the shop catalog keeps a single source of
 * truth — the server-authoritative `game_editions` catalog and
 * `profile_owned_editions` ownership — and lets a future paid edition
 * (Christmas, Lagos, …) light up automatically once its row lands.
 *
 * Refreshes on sign-in/out (profile id change) and whenever the shared
 * `coins_awarded` bus fires — the shop's purchase flow emits that event
 * after `purchase_item` returns ok, so a fresh USA purchase in the shop
 * tab lights up the picker on the create page without a hard reload.
 */
export function useOwnedMonopolyEditions(): {
  /** Edition slugs the host may pick (owned + free). Empty until loaded. */
  available: Set<string>
  loading: boolean
  /** Manual refresh — surfaces for tests and any future post-purchase flow. */
  refresh: () => void
} {
  const { profile } = useProfile()
  const profileId = profile?.id ?? null
  const [available, setAvailable] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => {
    invalidateEditionsCache()
    setRefreshTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAvailable(profileId, refreshTick)
      .then((set) => {
        if (!cancelled) setAvailable(set)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // profileId changes when the user signs in/out; refreshTick fires on
    // post-purchase re-fetch. Both are the signals that ownership may have
    // shifted since the last load. The module-level cache dedupes multiple
    // mounted consumers on the same (profileId, refreshTick) tuple.
  }, [profileId, refreshTick])

  // Same-tab invalidation from the shared coins-awarded bus. A purchase in
  // the shop rides this event, so the picker light-up is immediate on
  // whichever tab did the buying.
  useEffect(() => onCoinsAwarded(() => refresh()), [refresh])

  // Cross-tab invalidation: onCoinsAwarded is a window CustomEvent and does
  // not cross document boundaries, so a purchase in tab A leaves tab B's
  // picker stale. BroadcastChannel where available (all evergreen browsers)
  // with a localStorage `storage`-event fallback for the last holdouts
  // (older Safari webviews) — the shared coins bus doesn't do this yet, so
  // we own the cross-tab hop here rather than modify the shared bus.
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
    // Fan the local coins-awarded event out to other tabs so this same
    // handler picks it up over there. Guarded so we don't rebroadcast a
    // message that arrived from another tab (that would loop).
    const stopLocal = onCoinsAwarded(() => {
      try {
        bc?.postMessage(Date.now())
        localStorage.setItem(CHANNEL, String(Date.now()))
      } catch {
        // Private-mode storage / disabled BroadcastChannel — the same-tab
        // refresh above already ran, so the local tab still updates.
      }
    })
    return () => {
      bc?.close()
      window.removeEventListener('storage', onStorage)
      stopLocal()
    }
  }, [refresh])

  return { available, loading, refresh }
}

/**
 * True when the host can pick this edition — either it's a free grandfathered
 * one (always available) or the profile owns it in the shop.
 */
export function isMonopolyEditionAvailable(themeId: string, owned: Set<string>): boolean {
  const slug = MONOPOLY_THEME_TO_EDITION[themeId] ?? themeId
  if (FREE_MONOPOLY_EDITION_SLUGS.has(slug)) return true
  return owned.has(slug)
}
