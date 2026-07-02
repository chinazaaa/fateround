import { describe, it, expect } from 'vitest'
import { premoveNeedsPromotion, premoveTargets } from './chess-premove'

describe('premoveTargets', () => {
  it('offers pawn pushes and both diagonal captures regardless of occupancy', () => {
    expect([...premoveTargets('e2', 'p', 'w')].sort()).toEqual(['d3', 'e3', 'e4', 'f3'])
    // Not on the home rank — no double push.
    expect([...premoveTargets('e3', 'p', 'w')].sort()).toEqual(['d4', 'e4', 'f4'])
    // Black pawns move down the board.
    expect([...premoveTargets('d7', 'p', 'b')].sort()).toEqual(['c6', 'd5', 'd6', 'e6'])
  })

  it('clips pawn targets at the board edge', () => {
    expect([...premoveTargets('a2', 'p', 'w')].sort()).toEqual(['a3', 'a4', 'b3'])
  })

  it('offers knight jumps through occupied squares', () => {
    // From its starting square, before anything has moved.
    expect([...premoveTargets('g1', 'n', 'w')].sort()).toEqual(['e2', 'f3', 'h3'])
    expect(premoveTargets('d4', 'n', 'w').size).toBe(8)
  })

  it('offers full slider rays, ignoring blockers', () => {
    const rook = premoveTargets('a1', 'r', 'w')
    expect(rook.has('a8')).toBe(true)
    expect(rook.has('h1')).toBe(true)
    expect(rook.size).toBe(14)

    const bishop = premoveTargets('c1', 'b', 'w')
    expect(bishop.has('h6')).toBe(true)
    expect(bishop.has('a3')).toBe(true)

    const queen = premoveTargets('d1', 'q', 'w')
    expect(queen.has('d8')).toBe(true)
    expect(queen.has('h5')).toBe(true)
  })

  it('offers king steps plus castling hops from the home square', () => {
    const king = premoveTargets('e1', 'k', 'w')
    expect(king.has('g1')).toBe(true) // O-O
    expect(king.has('c1')).toBe(true) // O-O-O
    expect(king.has('e2')).toBe(true)

    // Off the home square: single steps only.
    const wandered = premoveTargets('e4', 'k', 'w')
    expect(wandered.has('g4')).toBe(false)
    expect(wandered.size).toBe(8)

    // Black castles from e8.
    expect(premoveTargets('e8', 'k', 'b').has('g8')).toBe(true)
    expect(premoveTargets('d8', 'k', 'b').has('b8')).toBe(false)
  })

  it('never includes the origin square', () => {
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k'] as const) {
      expect(premoveTargets('d4', type, 'w').has('d4')).toBe(false)
    }
  })

  it('returns nothing for malformed squares', () => {
    expect(premoveTargets('z9', 'q', 'w').size).toBe(0)
    expect(premoveTargets('', 'q', 'w').size).toBe(0)
  })
})

describe('premoveNeedsPromotion', () => {
  it('flags pawns landing on the last rank for their colour', () => {
    expect(premoveNeedsPromotion('e8', 'p', 'w')).toBe(true)
    expect(premoveNeedsPromotion('e1', 'p', 'b')).toBe(true)
    expect(premoveNeedsPromotion('e1', 'p', 'w')).toBe(false)
    expect(premoveNeedsPromotion('e7', 'p', 'w')).toBe(false)
    expect(premoveNeedsPromotion('e8', 'q', 'w')).toBe(false)
  })
})
