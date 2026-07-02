import { describe, it, expect } from 'vitest'
import { nextPowerOfTwo, computeRoundPairings, roundLabel, splitKnockoutField } from './tournament-bracket'

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
