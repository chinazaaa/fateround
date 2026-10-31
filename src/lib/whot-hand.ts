/**
 * Leaf helper for Whot hand values. Extracted from `@/lib/whot` so the trophies layer does
 * not import the whole game module — see `@/lib/ludo-pieces` for the cycle this breaks.
 * Keep this a LEAF: types only.
 */
import type { WhotCard } from '@/types'

export function whotHandSum(cards: WhotCard[]): number {
  return cards.reduce((sum, card) => sum + card.number, 0)
}
