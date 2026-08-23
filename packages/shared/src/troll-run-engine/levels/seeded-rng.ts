/**
 * Seeded randomness for level generation.
 *
 * xorshift32 and FNV-1a, the same pair the daily-puzzle generators use
 * (`daily-batch-generator.ts:56`). They sit in their own module because both the round recipe and the
 * level builder draw from them, and a descriptor only rebuilds its level if the two run the exact
 * same arithmetic.
 */

/** Deterministic floats in [0, 1) from a 32-bit seed. */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >> 17
    state ^= state << 5
    return (state >>> 0) / 0x100000000
  }
}

/** Folds a descriptor-shaped string into a seed, so neighbouring slots draw unrelated streams. */
export function hashSeedText(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function randomInt(rng: () => number, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1))
}

export function pickOne<TItem>(rng: () => number, items: readonly TItem[]): TItem {
  return items[Math.floor(rng() * items.length)]
}
