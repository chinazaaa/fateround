import { describe, it, expect } from 'vitest'
import {
  applyAyoMove,
  legalMoves,
  nextPit,
  sideOfPit,
  sowFromPit,
  startingPits,
  shouldEndGame,
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
  it('distributes seeds anti-clockwise', () => {
    const pits = startingPits()
    pits[0] = 3
    const { pits: next, capture } = sowFromPit(pits, 0)
    expect(next[0]).toBe(0)
    expect(next[1]).toBe(5)
    expect(next[2]).toBe(5)
    expect(next[3]).toBe(5)
    expect(capture).toBe(0)
  })

  it('captures exactly four on opponent pit', () => {
    const pits = startingPits()
    pits[5] = 1
    pits[6] = 3
    const { pits: next, capture } = sowFromPit(pits, 5)
    expect(next[6]).toBe(0)
    expect(capture).toBe(4)
  })

  it('does not capture on own pit with four', () => {
    const pits = startingPits()
    pits[4] = 1
    pits[5] = 3
    const { pits: next, capture } = sowFromPit(pits, 4)
    expect(next[5]).toBe(4)
    expect(capture).toBe(0)
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

  it('ends game and collects remaining seeds', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const result = applyAyoMove(pits, 23, 24, 'a', 0)
    expect(result.finished).toBe(true)
    expect(result.capturedA + result.capturedB).toBe(48)
  })

  it('declares winner by most seeds after final collection', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const result = applyAyoMove(pits, 25, 22, 'a', 0)
    expect(result.finished).toBe(true)
    expect(result.winnerSide).toBe('a')
  })
})

describe('shouldEndGame', () => {
  it('is true when board is empty', () => {
    expect(shouldEndGame(Array(AYO_PIT_COUNT).fill(0))).toBe(true)
  })

  it('is false at start', () => {
    expect(shouldEndGame(startingPits())).toBe(false)
  })

  it('is true when one side has no seeds on their row', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 2
    expect(shouldEndGame(pits)).toBe(true)
  })
})
