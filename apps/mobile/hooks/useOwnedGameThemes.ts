import { useMemo } from 'react'
import { useOwnedShopCatalog } from '@/hooks/useOwnedShopCatalog'

// Stable empty set / map so downstream `useMemo` deps don't invalidate
// when this hook reports no owned rows yet.
const EMPTY_SET: Set<string> = new Set()
const EMPTY_PRICE_MAP: Map<string, number> = new Map()

/**
 * Mobile mirror of `src/hooks/useOwnedGameThemes.ts`. Free themes are
 * always included; paid themes appear only after the profile owns them.
 * `default` isn't a `game_themes` row — pickers add it themselves.
 */
export function useOwnedGameThemes(gameType: string | null | undefined): {
  available: Set<string>
  prices: Map<string, number>
  loading: boolean
  refresh: () => void
} {
  const { items, loading, refresh } = useOwnedShopCatalog()

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
