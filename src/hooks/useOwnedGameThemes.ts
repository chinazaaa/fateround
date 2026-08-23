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

// Stable empty set so the identity check in downstream `useMemo` deps
// doesn't invalidate on every render for gameTypes with no owned
// items yet. A fresh `new Set()` per call would re-render everything
// that depends on `available`.
const EMPTY_SET: Set<string> = new Set()

export function useOwnedGameThemes(gameType: string | null | undefined): {
  /** Theme slugs (from game_themes) the host may pick for this game type. */
  available: Set<string>
  loading: boolean
  refresh: () => void
} {
  const { profile } = useProfile()
  const profileId = profile?.id ?? null
  const { items, loading, refresh } = useOwnedShopCatalog(profileId)

  const available = useMemo(() => {
    if (!gameType) return EMPTY_SET
    let set: Set<string> | null = null
    for (const item of items) {
      if (item.kind !== 'theme') continue
      if (item.gameType !== gameType) continue
      if (!item.owned && item.price !== 0) continue
      if (!set) set = new Set<string>()
      set.add(item.slug)
    }
    return set ?? EMPTY_SET
  }, [items, gameType])

  return { available, loading, refresh }
}
