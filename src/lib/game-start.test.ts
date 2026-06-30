import { describe, it, expect } from 'vitest'
import { GAME_START_SPECS, startCountError, type StartSpec } from '@/lib/game-start'

const atLeast: StartSpec = { minPlayers: 2, initialize: async () => ({ error: null }) }
const exact: StartSpec = { minPlayers: 2, exact: true, initialize: async () => ({ error: null }) }
const range: StartSpec = { minPlayers: 2, maxPlayers: 4, initialize: async () => ({ error: null }) }

describe('startCountError', () => {
  it('"at least": ok at/above min, error below', () => {
    expect(startCountError(2, atLeast)).toBeNull()
    expect(startCountError(9, atLeast)).toBeNull()
    expect(startCountError(1, atLeast)).toBe('Need at least 2 players to start')
  })

  it('"exact": ok only at exactly min', () => {
    expect(startCountError(2, exact)).toBeNull()
    expect(startCountError(1, exact)).toBe('Need exactly 2 players to start')
    expect(startCountError(3, exact)).toBe('Need exactly 2 players to start')
  })

  it('"range": ok within [min,max], error outside (en-dash message)', () => {
    expect(startCountError(2, range)).toBeNull()
    expect(startCountError(4, range)).toBeNull()
    expect(startCountError(1, range)).toBe('Need 2–4 players to start')
    expect(startCountError(5, range)).toBe('Need 2–4 players to start')
  })
})

describe('GAME_START_SPECS', () => {
  it('registers exactly the 10 uniform board games', () => {
    expect(Object.keys(GAME_START_SPECS).sort()).toEqual([
      'checkers',
      'chess',
      'crazy_eights',
      'ludo',
      'monopoly',
      'scrabble',
      'snake_and_ladder',
      'tic_tac_toe',
      'whot',
      'yahtzee',
    ])
  })

  it('flags the exact-count and range games', () => {
    expect(GAME_START_SPECS.chess?.exact).toBe(true)
    expect(GAME_START_SPECS.checkers?.exact).toBe(true)
    expect(GAME_START_SPECS.tic_tac_toe?.exact).toBe(true)
    expect(GAME_START_SPECS.scrabble?.maxPlayers).toBeGreaterThan(GAME_START_SPECS.scrabble!.minPlayers)
    expect(GAME_START_SPECS.whot?.exact).toBeUndefined()
  })
})
