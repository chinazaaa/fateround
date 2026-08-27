/**
 * Thin fetchers for the shop routes served from the web app. All three
 * routes are the same endpoints the web ShopClient calls — no server
 * change ships with the mobile shop.
 *
 * Every fetcher parses the JSON envelope first (outcome-first for
 * purchase) so the caller can decide what to do with a 402 or a 403
 * without inspecting the raw Response — this is the Phase 3 lesson:
 * `res.ok` alone is not the right branch.
 */
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import type { ShopKind } from '@/lib/coins/shop-catalog'

export type ShopItem = {
  kind: ShopKind
  slug: string
  name: string
  price: number
  owned: boolean
  gameType?: string
  preview?: Record<string, unknown>
}

export type ShopProfile = {
  coins: number
  equipped_frame: string | null
  equipped_name_color: string | null
  equipped_animation: string | null
  equipped_card_template: string | null
  streak_freezes: number
}

export type ShopCatalog = {
  items: ShopItem[]
  profile: ShopProfile | null
}

export type PurchaseOutcome = 'ok' | 'insufficient_funds' | 'already_owned' | 'server_error'

export type PurchaseResult = {
  outcome?: PurchaseOutcome
  new_balance?: number
  error?: string
}

export type EquipSlot = 'frame' | 'name_color' | 'animation' | 'card_template'

export async function fetchShopCatalog(): Promise<ShopCatalog | null> {
  try {
    const headers = (await authHeaders()) ?? {}
    const res = await fetch(apiUrl('/api/shop/catalog'), { headers })
    if (!res.ok) return null
    return (await res.json()) as ShopCatalog
  } catch {
    return null
  }
}

export async function postPurchase(
  kind: ShopKind,
  slug: string
): Promise<{ ok: boolean; status: number; data: PurchaseResult }> {
  // Price deliberately NOT sent — server resolves. Reviewer flagged in
  // Phase 3 that a client-supplied price is untrusted; only kind + slug
  // ever hit the wire.
  const headers = { 'Content-Type': 'application/json', ...((await authHeaders()) ?? {}) }
  const res = await fetch(apiUrl('/api/shop/purchase'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ kind, slug }),
  })
  const data = (await res.json().catch(() => ({}))) as PurchaseResult
  return { ok: res.ok, status: res.status, data }
}

export async function postEquip(
  slot: EquipSlot,
  slug: string | null
): Promise<{ ok: boolean; status: number; error?: string }> {
  const headers = { 'Content-Type': 'application/json', ...((await authHeaders()) ?? {}) }
  const res = await fetch(apiUrl('/api/shop/equip'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ slot, slug }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  return { ok: res.ok, status: res.status, error: data.error }
}
