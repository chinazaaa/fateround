import { describe, it, expect } from 'vitest'
import {
  nextPowerOfTwo,
  computeRoundPairings,
  computeRoundGroups,
  roundLabel,
  splitKnockoutField,
} from './tournament-bracket'

describe('nextPowerOfTwo', () => {
  it('returns the smallest power of two >= n', () => {
    expect(nextPowerOfTwo(1)).toBe(1)
    expect(nextPowerOfTwo(2)).toBe(2)
    expect(nextPowerOfTwo(3)).toBe(4)
    expect(nextPowerOfTwo(5)).toBe(8)
    expect(nextPowerOfTwo(8)).toBe(8)
    expect(nextPowerOfTwo(9)).toBe(16)
  })
})

describe('computeRoundPairings', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

  it('pairs an even field with no byes', () => {
    const { matches, byes } = computeRoundPairings(ids(8))
    expect(byes).toEqual([])
    expect(matches).toHaveLength(4)
    // every id appears exactly once
    expect(matches.flat().sort()).toEqual(ids(8).sort())
  })

  it('plays every game and byes nobody when the field is even (6 players → 3 games)', () => {
    const { matches, byes } = computeRoundPairings(ids(6))
    expect(byes).toEqual([])
    expect(matches).toHaveLength(3)
    expect(matches.flat().sort()).toEqual(ids(6).sort())
  })

  it('byes only the odd one out for an odd field (5 players → 2 games + 1 bye)', () => {
    const { matches, byes } = computeRoundPairings(ids(5))
    expect(byes).toHaveLength(1)
    expect(matches).toHaveLength(2)
    // the bye player isn't also in a match
    const playing = new Set(matches.flat())
    expect(playing.has(byes[0])).toBe(false)
  })

  it.each([
    [2, 0, 1],
    [3, 1, 1],
    [4, 0, 2],
    [5, 1, 2],
    [6, 0, 3],
    [7, 1, 3],
    [8, 0, 4],
  ])('for %i players yields %i byes and %i matches', (n, expectedByes, expectedMatches) => {
    const { matches, byes } = computeRoundPairings(ids(n))
    expect(byes).toHaveLength(expectedByes)
    expect(matches).toHaveLength(expectedMatches)
    // every player is accounted for exactly once
    expect([...byes, ...matches.flat()].sort()).toEqual(ids(n).sort())
    // at most one bye — only the odd one out ever sits
    expect(byes.length).toBeLessThanOrEqual(1)
    // survivors = one per match plus any bye = ceil(n / 2)
    expect(byes.length + matches.length).toBe(Math.ceil(n / 2))
  })

  it('handles a trivial single-player field', () => {
    expect(computeRoundPairings(['solo'])).toEqual({ matches: [], byes: ['solo'] })
  })

  it('does not bye a player who had a bye last round', () => {
    const field = ids(5) // odd → exactly one bye
    const priorBye = computeRoundPairings(field).byes[0]
    const next = computeRoundPairings(field, [priorBye])
    expect(next.byes).toHaveLength(1)
    expect(next.byes[0]).not.toBe(priorBye)
    // everyone still accounted for
    expect([...next.byes, ...next.matches.flat()].sort()).toEqual(field.sort())
  })

  it('still byes someone if everyone sat out last round (fallback)', () => {
    const field = ids(3)
    const res = computeRoundPairings(field, field)
    expect(res.byes).toHaveLength(1)
    expect(res.matches).toHaveLength(1)
  })
})

describe('computeRoundGroups', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

  it('splits a full field into rooms of the group size (16 at size 4 → 4 rooms of 4)', () => {
    const { groups, byes } = computeRoundGroups(ids(16), 4)
    expect(byes).toEqual([])
    expect(groups).toHaveLength(4)
    expect(groups.every((g) => g.length === 4)).toBe(true)
    expect(groups.flat().sort()).toEqual(ids(16).sort())
  })

  it.each([
    // [players, groupSize] -> expected room sizes
    [16, 4, [4, 4, 4, 4]],
    [8, 4, [4, 4]],
    [4, 4, [4]],
    [6, 4, [3, 3]], // balanced, not [4, 2]
    [10, 4, [4, 3, 3]],
    [5, 4, [3, 2]],
    [7, 4, [4, 3]],
    [2, 4, [2]],
    [3, 4, [3]],
  ])('for %i players at size %i yields rooms %j', (n, size, expectedSizes) => {
    const { groups, byes } = computeRoundGroups(ids(n), size)
    expect(byes).toEqual([])
    expect(groups.map((g) => g.length)).toEqual(expectedSizes)
    // every player is placed exactly once, and no room exceeds the group size or drops below 2
    expect(groups.flat().sort()).toEqual(ids(n).sort())
    expect(groups.every((g) => g.length >= 2 && g.length <= size)).toBe(true)
  })

  it('byes a lone survivor rather than making a room of one', () => {
    expect(computeRoundGroups(['solo'], 4)).toEqual({ groups: [], byes: ['solo'] })
  })

  it('converges to a champion: 16 → 4 → 1', () => {
    let field = ids(16)
    const sizes = [field.length]
    // Each round: one winner per group advances (simulate by taking the first id of each group).
    while (field.length > 1) {
      const { groups, byes } = computeRoundGroups(field, 4)
      field = [...groups.map((g) => g[0]), ...byes]
      sizes.push(field.length)
    }
    expect(sizes).toEqual([16, 4, 1])
  })

  it('folds a size-1 room into a bye at group size 2 (defensive)', () => {
    const { groups, byes } = computeRoundGroups(ids(3), 2)
    expect(groups).toEqual([['p1', 'p2']])
    expect(byes).toEqual(['p3'])
  })
})

describe('splitKnockoutField', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

  it.each([
    [16, 8, 8],
    [8, 4, 4],
    [4, 2, 2],
    [2, 1, 1],
    [10, 5, 5],
    [5, 3, 2],
    [3, 2, 1],
    [1, 1, 0],
  ])('for %i players advances %i and eliminates %i', (n, adv, elim) => {
    const { advancing, eliminated } = splitKnockoutField(ids(n))
    expect(advancing).toHaveLength(adv)
    expect(eliminated).toHaveLength(elim)
    // the field is partitioned; the top-ranked advance
    expect([...advancing, ...eliminated]).toEqual(ids(n))
    expect(advancing).toEqual(ids(n).slice(0, adv))
  })

  it('halves down to a champion: 16 → 8 → 4 → 2 → 1', () => {
    let field = ids(16)
    const sizes = [16]
    while (field.length > 1) {
      field = splitKnockoutField(field).advancing
      sizes.push(field.length)
    }
    expect(sizes).toEqual([16, 8, 4, 2, 1])
  })
})

describe('roundLabel', () => {
  it('names rounds by how many players enter', () => {
    expect(roundLabel(2)).toBe('Final')
    expect(roundLabel(4)).toBe('Semifinal')
    expect(roundLabel(8)).toBe('Quarterfinal')
    expect(roundLabel(6)).toBe('Quarterfinal') // rounds up to the bracket size
    expect(roundLabel(16)).toBe('Round of 16')
    expect(roundLabel(1)).toBe('Champion')
  })
})
