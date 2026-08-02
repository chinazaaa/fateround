import { describe, it, expect } from 'vitest'
import {
  applyAyoMove,
  captureOwareFromLanding,
  captureTraditionalFromLanding,
  dealWinnerFromHouses,
  legalMoves,
  legalMovesForSide,
  traceTraditionalSow,
  sowFromPit,
  startingPits,
  shouldEndGameForSide,
  totalSeedsOnSide,
  seedsOnBoard,
  nextPit,
  AYO_STARTING_SEEDS,
  AYO_PIT_COUNT,
  AYO_PITS_PER_SIDE,
} from './ayo'

const OWare_CONFIG = { variant: 'oware' as const, aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }
const TRADITIONAL_CONFIG = { variant: 'traditional' as const, aRowSize: AYO_PITS_PER_SIDE, bRowSize: AYO_PITS_PER_SIDE }

describe('ayo board helpers', () => {
  it('starts with 4 seeds in each active pit', () => {
    const pits = startingPits()
    expect(pits).toHaveLength(AYO_PIT_COUNT)
    expect(pits.filter((n) => n === AYO_STARTING_SEEDS)).toHaveLength(AYO_PIT_COUNT)
  })

  it('walks pits anti-clockwise', () => {
    expect(nextPit(0)).toBe(1)
    expect(nextPit(5)).toBe(6)
    expect(nextPit(11)).toBe(0)
  })
})

describe('oware sowFromPit', () => {
  it('distributes seeds anti-clockwise and skips the starting house', () => {
    const pits = startingPits()
    pits[0] = 3
    const { pits: next, capture } = sowFromPit(pits, 0, OWare_CONFIG)
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
    const { pits: next, capture } = sowFromPit(pits, 5, OWare_CONFIG)
    expect(next[6]).toBe(0)
    expect(capture).toBe(3)
  })
})

describe('traditional sowFromPit', () => {
  const empty = () => Array(AYO_PIT_COUNT).fill(0)

  it('mover wins a house when the last seed completes four on their own pit', () => {
    const pits = empty()
    pits[0] = 1
    pits[1] = 3
    const { pits: next, capture, housesA, housesB } = sowFromPit(pits, 0, TRADITIONAL_CONFIG)
    expect(next[1]).toBe(0)
    expect(capture).toBe(4)
    expect(housesA).toBe(1)
    expect(housesB).toBe(0)
  })

  it('mover wins a house when the last seed completes four on the opponent pit', () => {
    const pits = empty()
    pits[5] = 1
    pits[6] = 3
    const { pits: next, capture, housesA, housesB } = sowFromPit(pits, 5, TRADITIONAL_CONFIG)
    expect(next[6]).toBe(0)
    expect(capture).toBe(4)
    // The house always belongs to the mover, own side or opponent side.
    expect(housesA).toBe(1)
    expect(housesB).toBe(0)
  })

  it('does not capture a four completed mid-lap (only the last seed can capture)', () => {
    const pits = empty()
    pits[4] = 2
    pits[5] = 3
    // Sow 2: pit5 reaches 4 mid-lap (not captured), last seed lands empty at pit6.
    const { pits: next, capture, housesA, housesB } = sowFromPit(pits, 4, TRADITIONAL_CONFIG)
    expect(next[5]).toBe(4) // left standing, not captured
    expect(next[6]).toBe(1)
    expect(capture).toBe(0)
    expect(housesA).toBe(0)
    expect(housesB).toBe(0)
  })

  it('does not capture when the last seed makes five (4+1); it relays instead', () => {
    const pits = empty()
    pits[0] = 1
    pits[1] = 4
    const { capture, housesA, housesB } = sowFromPit(pits, 0, TRADITIONAL_CONFIG)
    expect(capture).toBe(0)
    expect(housesA).toBe(0)
    expect(housesB).toBe(0)
  })

  it('ends the lap when the last seed lands in an empty house', () => {
    const pits = empty()
    pits[0] = 1
    const { pits: next, capture, landingPit } = sowFromPit(pits, 0, TRADITIONAL_CONFIG)
    expect(landingPit).toBe(1)
    expect(next[1]).toBe(1)
    expect(capture).toBe(0)
  })

  it('relays through non-empty landings, conserving seeds when nothing is captured', () => {
    const pits = startingPits()
    const { pits: next, capture } = sowFromPit(pits, 0, TRADITIONAL_CONFIG)
    // Every seed is accounted for: whatever is not still on the board was captured.
    expect(seedsOnBoard(next) + capture).toBe(48)
    expect(next.some((n) => n === 0)).toBe(true)
  })

  it('trace records relay when last seed of a lap lands in a non-empty pit', () => {
    const pits = startingPits()
    pits[3] = 5
    const trace = traceTraditionalSow(pits, 3, TRADITIONAL_CONFIG)
    expect(trace.steps.some((step) => step.type === 'relay')).toBe(true)
    expect(trace.steps.filter((step) => step.type === 'drop').length).toBeGreaterThan(5)
  })

  it('trace ends on an empty landing pit', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const trace = traceTraditionalSow(pits, 0, TRADITIONAL_CONFIG)
    expect(trace.landingPit).toBe(1)
    expect(trace.pits[1]).toBe(1)
    expect(trace.steps.at(-1)?.type).toBe('end')
  })
})

describe('captureOwareFromLanding linkage', () => {
  it('captures linked opponent houses with 2 or 3 seeds', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[6] = 3
    pits[7] = 2
    pits[8] = 4
    const { pits: next, capture } = captureOwareFromLanding(pits, 7, 'a', OWare_CONFIG)
    expect(capture).toBe(5)
    expect(next[6]).toBe(0)
    expect(next[7]).toBe(0)
    expect(next[8]).toBe(4)
  })
})

describe('captureTraditionalFromLanding', () => {
  it('wins the house only on exactly four seeds', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[4] = 4
    const { capture, houses } = captureTraditionalFromLanding(pits, 4)
    expect(capture).toBe(4)
    expect(houses).toBe(1)
  })
})

describe('feeding rule (oware only)', () => {
  it('requires feeding when opponent row is empty', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[5] = 4
    pits[1] = 2
    expect(legalMovesForSide(pits, 'a', OWare_CONFIG)).toEqual([5])
  })
})

describe('applyAyoMove traditional', () => {
  it('credits the mover a house when the last seed completes four on the opponent pit', () => {
    const pits = startingPits()
    pits[5] = 1
    pits[6] = 3
    const result = applyAyoMove(pits, 0, 0, 0, 0, 'a', 5, TRADITIONAL_CONFIG)
    expect(result.finished).toBe(false)
    expect(result.housesA).toBe(1)
    expect(result.housesB).toBe(0)
    expect(result.capturedA).toBe(4)
  })

  it('does not shrink rows or finish a match — every game is a single board', () => {
    const pits = startingPits()
    pits[0] = 1
    pits[1] = 3
    const result = applyAyoMove(pits, 0, 0, 0, 0, 'a', 0, TRADITIONAL_CONFIG)
    expect(result.aRowSize).toBe(AYO_PITS_PER_SIDE)
    expect(result.bRowSize).toBe(AYO_PITS_PER_SIDE)
    expect(result.matchFinished).toBe(false)
  })

  it('applies the 8-seed endgame: a capture leaving four auto-awards the tail to the capturer', () => {
    // Board holds exactly 8 seeds: A completes a four (capturing 4), leaving 4 on B's row.
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    pits[1] = 3
    pits[6] = 4
    const result = applyAyoMove(pits, 0, 0, 0, 0, 'a', 0, TRADITIONAL_CONFIG)
    expect(result.finished).toBe(true)
    expect(seedsOnBoard(result.pits)).toBe(0)
    // 4 captured by completing the house + the remaining 4 auto-awarded = 8, two houses.
    expect(result.capturedA).toBe(8)
    expect(result.housesA).toBe(2)
    expect(result.capturedB).toBe(0)
    expect(result.winnerSide).toBe('a')
    expect(result.resultReason).toBe('most_houses')
  })

  it('picks winner by houses then seeds', () => {
    expect(dealWinnerFromHouses(3, 2, 0, 0).winnerSide).toBe('a')
    expect(dealWinnerFromHouses(2, 2, 5, 3).winnerSide).toBe('a')
    expect(dealWinnerFromHouses(2, 2, 4, 4).draw).toBe(true)
  })
})

describe('applyAyoMove oware', () => {
  it('ends game when opponent cannot move and sweeps the board', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const result = applyAyoMove(pits, 23, 24, 0, 0, 'a', 0, OWare_CONFIG)
    expect(result.finished).toBe(true)
    expect(result.capturedA + result.capturedB).toBe(48)
  })
})

describe('applyAyoMove traditional', () => {
  it('ends the deal when the opponent is left with no legal move', () => {
    // Side A sows its last seed onto its own row; side B is left empty and cannot move.
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 1
    const result = applyAyoMove(pits, 0, 0, 0, 0, 'a', 0, TRADITIONAL_CONFIG)
    expect(result.finished).toBe(true)
    expect(result.winnerSide).toBe('a')
    expect(seedsOnBoard(result.pits)).toBe(0)
    // The single seed left on A's row is collected into A's captured total.
    expect(result.capturedA).toBe(1)
    expect(result.capturedB).toBe(0)
  })
})

describe('shouldEndGameForSide', () => {
  it('is true when side to move has no legal move (oware)', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 2
    expect(shouldEndGameForSide(pits, 'b', OWare_CONFIG)).toBe(true)
  })

  it('is true when side to move has no legal move even if the board is not empty (traditional)', () => {
    const pits = Array(AYO_PIT_COUNT).fill(0)
    pits[0] = 3 // seeds only on side A
    expect(shouldEndGameForSide(pits, 'b', TRADITIONAL_CONFIG)).toBe(true)
    expect(shouldEndGameForSide(pits, 'a', TRADITIONAL_CONFIG)).toBe(false)
  })
})

describe('legalMoves with row size', () => {
  it('ignores disabled houses', () => {
    const pits = startingPits(5, 6)
    pits[5] = 0
    expect(legalMoves(pits, 'a', { aRowSize: 5, bRowSize: 6 })).toEqual([0, 1, 2, 3, 4])
  })
})

describe('totalSeedsOnSide', () => {
  it('counts seeds on active houses only', () => {
    const pits = startingPits(5, 6)
    expect(totalSeedsOnSide(pits, 'a', { aRowSize: 5, bRowSize: 6 })).toBe(20)
    expect(totalSeedsOnSide(pits, 'b', { aRowSize: 5, bRowSize: 6 })).toBe(24)
  })
})
