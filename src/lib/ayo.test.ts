import { describe, it, expect } from 'vitest'
import {
  applyAyoMove,
  captureFromLanding,
  legalMoves,
  legalMovesForSide,
  moveFeedsOpponent,
  nextPit,
  sideOfPit,
  sowFromPit,
  startingPits,
  shouldEndGameForSide,
  totalSeedsOnSide,
  AYO_STARTING_SEEDS,
  AYO_PIT_COUNT,
} from './ayo'

describe('ayo board helpers', () => {
  it('starts with 4 seeds in each pit', () => {
    const pits = startingPits()
    expect(pits).toHaveLength(AYO_PIT_COUNT)
    expect(pits.every((n) => n === AYO_STARTING_SEEDS)).toBe(true)
  })

  it('walks pits anti-clockwise', () => {
    expect(nextPit(0)).toBe(1)
    expect(nextPit(5)).toBe(6)
    expect(nextPit(11)).toBe(0)
  })

  it('assigns sides correctly', () => {
    expect(sideOfPit(0)).toBe('a')
    expect(sideOfPit(5)).toBe('a')
    expect(sideOfPit(6)).toBe('b')
    expect(sideOfPit(11)).toBe('b')
  })
})

describe('sowFromPit', () => {
  it('distributes seeds anti-clockwise and skips the starting house', () => {
    const pits = startingPits()
    pits[0] = 3
    const { pits: next, capture } = sowFromPit(pits, 0)
    expect(next[0]).toBe(0)
    expect(next[1]).toBe(5)
    expect(next[2]).toBe(5)
    expect(next[3]).toBe(5)
    expect(capture).toBe(0)
  })

  it('captures when last seed leaves 2 or 3 on opponent pit', () => {
    const pits = startingPits()
    pits[5] = 1
    pits[6] = 2
    const { pits: next, capture } = sowFromPit(pits, 5)
    expect(next[6]).toBe(0)
    expect(capture).toBe(3)
  })

  it('does not capture when landing leaves 4 on opponent pit', () => {
    const pits = startingPits()
    pits[5] = 1
    pits[6] = 3
    const { pits: next, capture } = sowFromPit(pits, 5)
    expect(next[6]).toBe(4)
    expect(capture).toBe(0)
  })

  it('does not capture on own pit', () => {
    const pits = startingPits()
    pits[4] = 1
    pits[5] = 2
    const { pits: next, capture } = sowFromPit(pits, 4)
    expect(next[5]).toBe(3)
    expect(capture).toBe(0)
  })
})

describe('captureFromLanding linkage', () => {
  it('captures linked opponent houses with 2 or 3 seeds', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[6] = 3
    pits[7] = 2
    pits[8] = 4
    const { pits: next, capture } = captureFromLanding(pits, 7, 'a')
    expect(capture).toBe(5)
    expect(next[6]).toBe(0)
    expect(next[7]).toBe(0)
    expect(next[8]).toBe(4)
  })
})

describe('feeding rule', () => {
  it('detects moves that drop seeds on the opponent row', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[5] = 4
    pits[1] = 2
    expect(moveFeedsOpponent(pits, 5)).toBe(true)
    expect(moveFeedsOpponent(pits, 1)).toBe(false)
  })

  it('requires feeding when opponent row is empty', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[5] = 4
    pits[1] = 2
    expect(legalMovesForSide(pits, 'a')).toEqual([5])
  })

  it('allows any move when opponent still has seeds', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 4
    pits[1] = 2
    pits[6] = 1
    expect(legalMovesForSide(pits, 'a')).toEqual([0, 1])
  })
})

describe('applyAyoMove', () => {
  it('rejects empty pits', () => {
    const pits = startingPits()
    pits[0] = 0
    expect(() => applyAyoMove(pits, 0, 0, 'a', 0)).toThrow()
  })

  it('rejects opponent pits', () => {
    const pits = startingPits()
    expect(() => applyAyoMove(pits, 0, 0, 'a', 6)).toThrow()
  })

  it('lists legal moves on own side only', () => {
    const pits = startingPits()
    pits[0] = 0
    expect(legalMoves(pits, 'a')).toEqual([1, 2, 3, 4, 5])
  })

  it('ends game when opponent cannot move and sweeps the board', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const result = applyAyoMove(pits, 23, 24, 'a', 0)
    expect(result.finished).toBe(true)
    expect(result.capturedA + result.capturedB).toBe(48)
  })

  it('declares winner after opponent sweep', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const result = applyAyoMove(pits, 25, 22, 'a', 0)
    expect(result.finished).toBe(true)
    expect(result.winnerSide).toBe('a')
  })
})

describe('shouldEndGameForSide', () => {
  it('is true when board is empty', () => {
    expect(shouldEndGameForSide(Array(AYO_PIT_COUNT).fill(0), 'a')).toBe(true)
  })

  it('is false at start', () => {
    expect(shouldEndGameForSide(startingPits(), 'a')).toBe(false)
    expect(shouldEndGameForSide(startingPits(), 'b')).toBe(false)
  })

  it('is true when side to move has no legal move', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 2
    expect(shouldEndGameForSide(pits, 'b')).toBe(true)
    expect(shouldEndGameForSide(pits, 'a')).toBe(false)
  })
})

describe('totalSeedsOnSide', () => {
  it('counts seeds on a row', () => {
    const pits = startingPits()
    expect(totalSeedsOnSide(pits, 'a')).toBe(24)
    expect(totalSeedsOnSide(pits, 'b')).toBe(24)
  })
})
