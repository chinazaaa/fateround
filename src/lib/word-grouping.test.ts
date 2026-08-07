import { describe, it, expect } from 'vitest'
import { pickWordGroupingPuzzle, wordGroupingPuzzleKey, type WordGroupingPuzzleEntry } from './word-grouping'

const P = (id: string): WordGroupingPuzzleEntry => ({
  groups: [
    { category: `${id}-yellow`, words: ['a', 'b', 'c', 'd'], difficulty: 1 },
    { category: `${id}-green`, words: ['e', 'f', 'g', 'h'], difficulty: 2 },
    { category: `${id}-blue`, words: ['i', 'j', 'k', 'l'], difficulty: 3 },
    { category: `${id}-purple`, words: ['m', 'n', 'o', 'p'], difficulty: 4 },
  ],
})

describe('pickWordGroupingPuzzle — replay variety', () => {
  it('never repeats a puzzle while the pool has fresh entries left', () => {
    // Reproduces the "play again dealt me the same puzzle" report: pick from a small pool
    // in a loop, threading the returned `nextUsage` back in as the next call's `used`. The
    // picker should walk every puzzle exactly once before any second visit — no matter what
    // seeds it's called with — because used-key filtering runs before the seed-modulo pick.
    const pool = ['a', 'b', 'c', 'd'].map(P)
    const seen = new Set<string>()
    let usage: Record<string, number> | undefined
    for (let i = 0; i < pool.length; i++) {
      const result = pickWordGroupingPuzzle(pool, i * 7919, usage) // arbitrary varied seeds
      expect(result).not.toBeNull()
      const key = wordGroupingPuzzleKey(result!.puzzle)
      expect(seen.has(key)).toBe(false)
      seen.add(key)
      usage = result!.nextUsage
    }
    expect(seen.size).toBe(pool.length)
  })

  it('resets the cycle when every puzzle in the pool has been used', () => {
    // Without the reset, a small pack would deadlock on `fresh.length === 0`. The fix path
    // is: filter to fresh; if empty, pick from the whole pool AND reset the persisted usage
    // to just the newly-chosen puzzle (so the next round has n-1 fresh again, not zero).
    const pool = [P('a'), P('b')]
    const exhausted: Record<string, number> = {
      [wordGroupingPuzzleKey(pool[0])]: 1,
      [wordGroupingPuzzleKey(pool[1])]: 1,
    }
    const result = pickWordGroupingPuzzle(pool, 0, exhausted)
    expect(result).not.toBeNull()
    // Cycle reset: nextUsage carries ONLY the just-picked puzzle, not the pre-existing pair.
    expect(Object.keys(result!.nextUsage)).toHaveLength(1)
    expect(result!.nextUsage[wordGroupingPuzzleKey(result!.puzzle)]).toBe(1)
  })

  it('returns null for an empty pool', () => {
    expect(pickWordGroupingPuzzle([], 42, undefined)).toBeNull()
  })

  it('is deterministic in `seed` given the same used-set — retries do not shuffle', () => {
    // The start route can be retried by the platform (serverless timeouts, warm-instance
    // races); the same seed + used-set must return the same puzzle so a retry doesn't hand
    // out a different puzzle from the one already recorded in `word_grouping_metadata`.
    const pool = ['a', 'b', 'c', 'd', 'e'].map(P)
    const seed = 1234567
    const a = pickWordGroupingPuzzle(pool, seed, undefined)
    const b = pickWordGroupingPuzzle(pool, seed, undefined)
    expect(a).not.toBeNull()
    expect(wordGroupingPuzzleKey(a!.puzzle)).toBe(wordGroupingPuzzleKey(b!.puzzle))
  })

  it('is order-insensitive: same puzzle with reordered groups has the same key', () => {
    // Categories from admin/library sources can arrive in any order; the on-disk key must
    // stay stable so a game's `pool_usage` doesn't treat two equivalent representations as
    // different puzzles.
    const p = P('mix')
    const reordered: WordGroupingPuzzleEntry = { groups: [...p.groups].reverse() }
    expect(wordGroupingPuzzleKey(p)).toBe(wordGroupingPuzzleKey(reordered))
  })
})
