'use client'

import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'

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
 */
export function useOwnedMonopolyEditions(): {
  /** Edition slugs the host may pick (owned + free). Empty until loaded. */
  available: Set<string>
  loading: boolean
} {
  const [available, setAvailable] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
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
        // grandfathered editions will still appear because the picker treats
        // them as always-available (see hostPickerEditionThemeIds below).
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { available, loading }
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
