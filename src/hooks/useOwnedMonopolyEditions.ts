'use client'

import { useMemo } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useOwnedShopCatalog } from '@/hooks/useOwnedShopCatalog'
import { FREE_MONOPOLY_EDITION_SLUGS, MONOPOLY_THEME_TO_EDITION } from '@/lib/coins/editions'

// Re-export for existing callers that already reach into this hook module.
// The canonical maps live in src/lib/coins/editions.ts (single source of
// truth for theme ↔ edition_slug so new editions land in one file).
export { MONOPOLY_THEME_TO_EDITION, FREE_MONOPOLY_EDITION_SLUGS }
export { MONOPOLY_THEME_TO_EDITION as MONOPOLY_THEME_TO_EDITION_SLUG }

// Stable empty set / map so downstream `useMemo` deps don't invalidate
// when this hook happens to have no owned rows to report (guest, first
// paint before the catalog fetch resolves). See useOwnedGameThemes for
// the same pattern.
const EMPTY_SET: Set<string> = new Set()
const EMPTY_PRICE_MAP: Map<string, number> = new Map()

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
 *
 * Caching + cross-tab fanout live in `useOwnedShopCatalog` so this hook
 * and `useOwnedGameThemes` share one in-flight fetch and one
 * BroadcastChannel subscription instead of doubling both.
 */
export function useOwnedMonopolyEditions(): {
  /** Edition slugs the host may pick (owned + free). Empty until loaded. */
  available: Set<string>
  /** Slug → price_coins for every Monopoly edition in the catalog
   *  (owned or not). Locked tiles read this so they can show
   *  "Unlock — 800" instead of a generic "Unlock in Shop". */
  prices: Map<string, number>
  loading: boolean
  /** Manual refresh — surfaces for tests and any future post-purchase flow. */
  refresh: () => void
} {
  const { profile } = useProfile()
  const profileId = profile?.id ?? null
  const { items, loading, refresh } = useOwnedShopCatalog(profileId)

  const { available, prices } = useMemo(() => {
    let ownedSet: Set<string> | null = null
    let priceMap: Map<string, number> | null = null
    for (const item of items) {
      if (item.kind !== 'edition') continue
      if (item.gameType !== 'monopoly') continue
      if (!priceMap) priceMap = new Map<string, number>()
      priceMap.set(item.slug, item.price)
      if (!item.owned && item.price !== 0) continue
      if (!ownedSet) ownedSet = new Set<string>()
      ownedSet.add(item.slug)
    }
    return { available: ownedSet ?? EMPTY_SET, prices: priceMap ?? EMPTY_PRICE_MAP }
  }, [items])

  return { available, prices, loading, refresh }
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
