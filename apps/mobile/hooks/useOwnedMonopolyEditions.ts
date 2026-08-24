import { useMemo } from 'react'
import { useOwnedShopCatalog } from '@/hooks/useOwnedShopCatalog'
import {
  FREE_MONOPOLY_EDITION_SLUGS,
  MONOPOLY_THEME_TO_EDITION,
  isMonopolyEditionAvailable,
} from '@/lib/coins/shop-catalog'

export { MONOPOLY_THEME_TO_EDITION, FREE_MONOPOLY_EDITION_SLUGS, isMonopolyEditionAvailable }

const EMPTY_SET: Set<string> = new Set()
const EMPTY_PRICE_MAP: Map<string, number> = new Map()

/**
 * Mobile mirror of `src/hooks/useOwnedMonopolyEditions.ts`. Free editions
 * are always allowed; paid editions appear only after the profile owns them.
 */
export function useOwnedMonopolyEditions(): {
  available: Set<string>
  prices: Map<string, number>
  loading: boolean
  refresh: () => void
} {
  const { items, loading, refresh } = useOwnedShopCatalog()

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
