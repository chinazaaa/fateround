/** Prefer questions that have been played least often (global history). */

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function countValues(values: Iterable<string | null | undefined>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

/**
 * Pick `count` unique items from `pool`, preferring those with the lowest usage counts.
 * Ties are shuffled randomly. Items missing from `usageCounts` count as 0 uses.
 */
export function pickLeastUsed<T>(
  pool: readonly T[],
  keyFn: (item: T) => string,
  usageCounts: Map<string, number>,
  count: number
): T[] {
  if (count <= 0 || pool.length === 0) return []

  const target = Math.min(count, pool.length)
  const picked: T[] = []
  const pickedKeys = new Set<string>()

  while (picked.length < target) {
    const remaining = pool.filter((item) => !pickedKeys.has(keyFn(item)))
    if (remaining.length === 0) break

    let minCount = Infinity
    for (const item of remaining) {
      const uses = usageCounts.get(keyFn(item)) ?? 0
      if (uses < minCount) minCount = uses
    }

    const tier = shuffleInPlace(remaining.filter((item) => (usageCounts.get(keyFn(item)) ?? 0) === minCount))

    for (const item of tier) {
      if (picked.length >= target) break
      const key = keyFn(item)
      if (pickedKeys.has(key)) continue
      picked.push(item)
      pickedKeys.add(key)
    }
  }

  return picked
}
