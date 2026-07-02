import { describe, it, expect } from 'vitest'
import { nextPowerOfTwo, computeRoundPairings, roundLabel } from './tournament-bracket'

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

  it('pairs a power-of-two field with no byes', () => {
    const { matches, byes } = computeRoundPairings(ids(8))
    expect(byes).toEqual([])
    expect(matches).toHaveLength(4)
    // every id appears exactly once
    expect(matches.flat().sort()).toEqual(ids(8).sort())
  })

  it('gives first-round byes so survivors become a power of two (6 players)', () => {
    const { matches, byes } = computeRoundPairings(ids(6))
    expect(byes).toHaveLength(2) // 8 - 6
    expect(matches).toHaveLength(2) // remaining 4 players
    // survivors after the round: 2 byes + 2 match winners = 4 (a power of two)
    expect(byes.length + matches.length).toBe(4)
    // no id is both playing and on a bye
    const playing = new Set(matches.flat())
    for (const b of byes) expect(playing.has(b)).toBe(false)
  })

  it.each([
    [3, 1, 1],
    [5, 3, 1],
    [7, 1, 3],
    [4, 0, 2],
    [2, 0, 1],
  ])('for %i players yields %i byes and %i matches', (n, expectedByes, expectedMatches) => {
    const { matches, byes } = computeRoundPairings(ids(n))
    expect(byes).toHaveLength(expectedByes)
    expect(matches).toHaveLength(expectedMatches)
    // every player is accounted for exactly once
    expect([...byes, ...matches.flat()].sort()).toEqual(ids(n).sort())
    // survivors (byes + one winner per match) are a clean power of two
    const survivors = byes.length + matches.length
    expect(survivors).toBe(nextPowerOfTwo(n) / 2)
    expect(Number.isInteger(Math.log2(survivors))).toBe(true)
  })

  it('handles a trivial single-player field', () => {
    expect(computeRoundPairings(['solo'])).toEqual({ matches: [], byes: ['solo'] })
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
