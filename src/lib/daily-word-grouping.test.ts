import { describe, it, expect } from 'vitest'
import { generateWordGroupingPuzzle, generateWordGroupingFromContent } from './daily-word-grouping'

// The 16 tiles are rendered from a flat word list, so a word that appears in two
// groups collapses into one tile: the grid renders 15, React warns about duplicate
// keys, and selecting the word ambiguously belongs to both groups. Every puzzle in
// the built-in bank must therefore be 4 groups x 4 distinct words.
describe('word grouping puzzle bank', () => {
  // Walk the bank by seed — generateWordGroupingPuzzle indexes it as seed % length.
  const seeds = Array.from({ length: 60 }, (_, i) => i)

  it.each(seeds)('seed %i yields 16 unique words across 4 groups', (seed) => {
    const { puzzleData } = generateWordGroupingPuzzle(seed, 300)
    const groups = puzzleData.solution.groups

    expect(groups).toHaveLength(4)
    for (const g of groups) {
      expect(g.words).toHaveLength(4)
      expect(g.category.trim()).not.toBe('')
    }

    const all = groups.flatMap((g) => g.words)
    expect(all).toHaveLength(16)
    expect(new Set(all.map((w) => w.toLowerCase())).size).toBe(16)

    // The shuffled tile list must be exactly the same 16 words.
    expect([...puzzleData.words].sort()).toEqual([...all].sort())
  })
})

describe('generateWordGroupingFromContent', () => {
  const validPuzzle = {
    groups: [
      { category: 'A', words: ['a1', 'a2', 'a3', 'a4'], difficulty: 1 },
      { category: 'B', words: ['b1', 'b2', 'b3', 'b4'], difficulty: 2 },
      { category: 'C', words: ['c1', 'c2', 'c3', 'c4'], difficulty: 3 },
      { category: 'D', words: ['d1', 'd2', 'd3', 'd4'], difficulty: 4 },
    ],
  }

  it('accepts a well-formed puzzle', () => {
    const res = generateWordGroupingFromContent(validPuzzle, 1, 300)
    expect(res).not.toBeNull()
    expect(res?.puzzleData.words).toHaveLength(16)
  })

  it('picks one puzzle out of an array', () => {
    const res = generateWordGroupingFromContent([validPuzzle], 1, 300)
    expect(res).not.toBeNull()
  })

  it('rejects a puzzle with a duplicated word', () => {
    const dup = {
      groups: [
        { category: 'A', words: ['x', 'a2', 'a3', 'a4'], difficulty: 1 },
        { category: 'B', words: ['x', 'b2', 'b3', 'b4'], difficulty: 2 },
        { category: 'C', words: ['c1', 'c2', 'c3', 'c4'], difficulty: 3 },
        { category: 'D', words: ['d1', 'd2', 'd3', 'd4'], difficulty: 4 },
      ],
    }
    expect(generateWordGroupingFromContent(dup, 1, 300)).toBeNull()
  })

  it('rejects malformed content', () => {
    expect(generateWordGroupingFromContent(null, 1, 300)).toBeNull()
    expect(generateWordGroupingFromContent([], 1, 300)).toBeNull()
    expect(generateWordGroupingFromContent({ groups: [] }, 1, 300)).toBeNull()
  })
})
