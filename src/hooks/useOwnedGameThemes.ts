'use client'

import { useMemo } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useOwnedShopCatalog } from '@/hooks/useOwnedShopCatalog'

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
 *
 * Caching and cross-tab fanout live in `useOwnedShopCatalog` — one
 * in-flight fetch and one BroadcastChannel subscription are shared
 * across every mounted ownership hook.
 */

// Stable empty set / map so identity in downstream `useMemo` deps
// doesn't invalidate on every render for gameTypes with no owned
// items yet. A fresh `new Set()` per call would re-render everything
// that depends on `available`.
const EMPTY_SET: Set<string> = new Set()
const EMPTY_PRICE_MAP: Map<string, number> = new Map()

export function useOwnedGameThemes(gameType: string | null | undefined): {
  /** Theme slugs (from game_themes) the host may pick for this game type. */
  available: Set<string>
  /** Slug → price_coins for every catalog row scoped to this game type
   *  (owned or not). Locked tiles read this so they can show
   *  "Unlock — 400" instead of a generic "Unlock in Shop". */
  prices: Map<string, number>
  loading: boolean
  refresh: () => void
} {
  const { profile } = useProfile()
  const profileId = profile?.id ?? null
  const { items, loading, refresh } = useOwnedShopCatalog(profileId)

  const { available, prices } = useMemo(() => {
    if (!gameType) return { available: EMPTY_SET, prices: EMPTY_PRICE_MAP }
    let ownedSet: Set<string> | null = null
    let priceMap: Map<string, number> | null = null
    for (const item of items) {
      if (item.kind !== 'theme') continue
      if (item.gameType !== gameType) continue
      if (!priceMap) priceMap = new Map<string, number>()
      priceMap.set(item.slug, item.price)
      if (!item.owned && item.price !== 0) continue
      if (!ownedSet) ownedSet = new Set<string>()
      ownedSet.add(item.slug)
    }
    return { available: ownedSet ?? EMPTY_SET, prices: priceMap ?? EMPTY_PRICE_MAP }
  }, [items, gameType])

  return { available, prices, loading, refresh }
}
