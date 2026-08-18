/**
 * Canonical trophy display order: platinum first, bronze last — highest prestige to lowest.
 * Every trophy list in the app (game landing pages, the public profile card and cabinet, and a
 * player's own per-game trophy list) sorts by this, so the ordering reads the same everywhere.
 */
export const TIER_RANK: Record<string, number> = { platinum: 0, gold: 1, silver: 2, bronze: 3 }

/** `Array#sort` comparator: highest tier first. Unknown tiers sort last rather than crashing. */
export function byTierDesc<T extends { tier: string }>(a: T, b: T): number {
  return (TIER_RANK[a.tier] ?? 99) - (TIER_RANK[b.tier] ?? 99)
}
