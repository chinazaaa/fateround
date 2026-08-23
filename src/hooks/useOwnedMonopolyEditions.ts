'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { useProfile } from '@/hooks/useProfile'
import { onCoinsAwarded } from '@/lib/coins/earn-events'

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

  const refresh = useCallback(() => setRefreshTick((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const headers = (await authHeaders()) ?? {}
        const res = await fetch('/api/shop/catalog', { headers })
        if (!res.ok) throw new Error('catalog fetch failed')
        const data = (await res.json()) as {
          items: { kind: string; slug: string; price: number; owned: boolean; gameType?: string }[]
        }
        if (cancelled) return
        const set = new Set<string>()
        for (const item of data.items ?? []) {
          if (item.kind !== 'edition') continue
          if (item.gameType !== 'monopoly') continue
          if (item.owned || item.price === 0) set.add(item.slug)
        }
        setAvailable(set)
      } catch {
        // Fall back to "no paid editions unlocked" so a broken catalog fetch
        // never shows a paid edition the host cannot actually use. The free
        // grandfathered editions still appear because the picker treats them
        // as always-available.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // profileId changes when the user signs in/out; refreshTick fires on
    // post-purchase re-fetch. Both are the signals that ownership may have
    // shifted since the last load.
  }, [profileId, refreshTick])

  // Any purchase in this browser (including in another tab, thanks to the
  // shared window CustomEvent bus) invalidates the cache. Same signal the
  // top-right CoinChip listens to.
  useEffect(() => onCoinsAwarded(() => refresh()), [refresh])

  return { available, loading, refresh }
}

/**
 * Map from web-theme id to the `game_editions.slug` the shop uses.
 * Kept here as the single translation so picker code doesn't scatter
 * hardcoded 'default' → 'london' substitutions.
 */
export const MONOPOLY_THEME_TO_EDITION_SLUG: Record<string, string> = {
  default: 'london',
  naija: 'naija',
  pirate: 'pirate',
  arctic: 'arctic',
  america: 'america',
}

/** Free-forever grandfathered editions; always shown in the picker. */
export const FREE_MONOPOLY_EDITION_SLUGS = new Set(['london', 'naija', 'pirate', 'arctic'])

/**
 * True when the host can pick this edition — either it's a free grandfathered
 * one (always available) or the profile owns it in the shop.
 */
export function isMonopolyEditionAvailable(themeId: string, owned: Set<string>): boolean {
  const slug = MONOPOLY_THEME_TO_EDITION_SLUG[themeId] ?? themeId
  if (FREE_MONOPOLY_EDITION_SLUGS.has(slug)) return true
  return owned.has(slug)
}
