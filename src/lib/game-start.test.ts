import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { GAME_START_SPECS, startCountError, startHumanSeatError, type StartSpec } from '@/lib/game-start'

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

describe('startHumanSeatError', () => {
  it('passes rooms with zero bots (bot-free is always fine)', () => {
    expect(startHumanSeatError([{ is_bot: false }, { is_bot: false }])).toBeNull()
    expect(startHumanSeatError([{}, {}])).toBeNull()
  })

  it('passes rooms mixing at least one human with bots', () => {
    expect(startHumanSeatError([{ is_bot: false }, { is_bot: true }])).toBeNull()
    expect(startHumanSeatError([{ is_bot: true }, { is_bot: true }, { is_bot: false }])).toBeNull()
  })

  it('rejects rooms with only bots seated (the load-bearing invariant)', () => {
    expect(startHumanSeatError([{ is_bot: true }, { is_bot: true }])).toMatch(/human/i)
  })
})

describe('GAME_START_SPECS', () => {
  it('registers exactly the 19 uniform games', () => {
    expect(Object.keys(GAME_START_SPECS).sort()).toEqual([
      'ayo',
      'checkers',
      'checkers_international',
      'checkers_nigeria',
      'chess',
      'crazy_eights',
      'gofish',
      'ludo',
      'mafia',
      'mahjong',
      'monopoly',
      'rummy',
      'scrabble',
      'snake_and_ladder',
      'tic_tac_toe',
      'troll_run',
      'uno',
      'whot',
      'yahtzee',
    ])
  })

  it('flags the exact-count and range games', () => {
    expect(GAME_START_SPECS.ayo?.exact).toBe(true)
    expect(GAME_START_SPECS.chess?.exact).toBe(true)
    expect(GAME_START_SPECS.checkers?.exact).toBe(true)
    expect(GAME_START_SPECS.tic_tac_toe?.exact).toBe(true)
    expect(GAME_START_SPECS.scrabble?.maxPlayers).toBeGreaterThan(GAME_START_SPECS.scrabble!.minPlayers)
    expect(GAME_START_SPECS.troll_run?.maxPlayers).toBeGreaterThan(GAME_START_SPECS.troll_run!.minPlayers)
    expect(GAME_START_SPECS.whot?.exact).toBeUndefined()
  })
})

function makeStartAdmin() {
  const sessionInserts: Record<string, unknown>[] = []

  function from(table: string) {
    return {
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === 'troll_run_sessions') sessionInserts.push(payload as Record<string, unknown>)
        return Promise.resolve({ error: null })
      },
    }
  }

  return { admin: { from } as unknown as SupabaseClient, sessionInserts }
}

describe('GAME_START_SPECS.troll_run — host settings', () => {
  it('seeds the session from the host lobby columns rather than the defaults', async () => {
    const mock = makeStartAdmin()

    const { error } = await GAME_START_SPECS.troll_run!.initialize(mock.admin, 'GAME', ['player-1'], {
      troll_run_rounds: 3,
      troll_run_time_limit: 90,
      troll_run_world: 'machines',
    })

    expect(error).toBeNull()
    expect(mock.sessionInserts).toHaveLength(1)
    expect(mock.sessionInserts[0]).toMatchObject({
      total_rounds: 3,
      round_time_limit: 90,
      current_world: 'machines',
    })
  })

  it('falls back to the defaults when the host changed nothing', async () => {
    const mock = makeStartAdmin()

    await GAME_START_SPECS.troll_run!.initialize(mock.admin, 'GAME', ['player-1'], {})

    expect(mock.sessionInserts[0]).toMatchObject({
      total_rounds: 5,
      round_time_limit: 120,
      current_world: 'pits',
    })
  })

  it('reports the host round count so start does not stamp games.rounds_count to 1', () => {
    expect(GAME_START_SPECS.troll_run?.roundsCount?.({ troll_run_rounds: 3 })).toBe(3)
    expect(GAME_START_SPECS.troll_run?.roundsCount?.({})).toBe(5)
  })
})
