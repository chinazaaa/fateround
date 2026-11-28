import { describe, it, expect } from 'vitest'
import { initializeScrabbleGame } from './scrabble'
import { INTERNAL_ERROR_MESSAGE } from './api-errors'
import { SCRABBLE_DEFAULT_DICTIONARY } from './scrabble-dictionary-meta'
import { tileSetForDictionary } from './scrabble-rulesets'

// Starting a round is ONE database call (`start_scrabble_game`): the function deals AND activates the game in one
// transaction, so there is no half-started room to resume. It refuses a game that is no longer `waiting` (a live game's
// scores must never be wiped; this also serializes overlapping starts), replaces the racks and the session together (a
// failed start leaves the previous result intact), and rejects a seat whose player row is gone. These tests pin the app contract:
// exactly one rpc carries the whole deal, and each outcome maps to the right result.

type Outcome = { status: string; reason?: string }

function makeMockSupabase(outcome: Outcome | { rpcError: string }, opts: { failSettings?: boolean } = {}) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const tableOps: string[] = []
  const fromCalls: string[] = []

  function chain(data: unknown): Promise<{ data: unknown; error: null }> & Record<string, unknown> {
    const p = Promise.resolve({ data, error: null }) as Promise<{ data: unknown; error: null }> &
      Record<string, unknown>
    p.eq = () => chain(data)
    p.order = () => chain(data)
    p.select = () => chain(data)
    p.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? null : data, error: null })
    return p
  }

  function chainError(): Promise<{ data: null; error: { message: string } }> & Record<string, unknown> {
    const result = { data: null, error: { message: 'boom' } }
    const p = Promise.resolve(result) as Promise<typeof result> & Record<string, unknown>
    p.eq = () => chainError()
    p.maybeSingle = () => Promise.resolve(result)
    return p
  }

  const supabase = {
    from(table: string) {
      fromCalls.push(table)
      return {
        select() {
          if (table === 'games' && opts.failSettings) return chainError()
          if (table === 'games') return chain({ timer_seconds: 0, scrabble_dictionary_id: null })
          if (table === 'players')
            return chain([
              { id: 'A', name: 'Alice' },
              { id: 'B', name: 'Bob' },
            ])
          return chain(null)
        },
        insert() {
          tableOps.push(`${table}:insert`)
          return chain(null)
        },
        update() {
          tableOps.push(`${table}:update`)
          return chain(null)
        },
        delete() {
          tableOps.push(`${table}:delete`)
          return chain(null)
        },
      }
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      if ('rpcError' in outcome) return Promise.resolve({ data: null, error: { message: outcome.rpcError } })
      return Promise.resolve({ data: outcome, error: null })
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: supabase as any, rpcCalls, tableOps, fromCalls }
}

describe('initializeScrabbleGame — one transactional deal', () => {
  it('sends the whole deal (session row + every seat) in a single start_scrabble_game call and writes no table itself', async () => {
    const { supabase, rpcCalls, tableOps } = makeMockSupabase({ status: 'started' })
    expect(await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).toEqual({})
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('start_scrabble_game')
    const row = rpcCalls[0].args.p_session_row as Record<string, unknown>
    const states = rpcCalls[0].args.p_state_rows as { player_id: string; rack: string[]; score: number }[]
    expect(row.phase).toBe('playing')
    expect([...(row.turn_order as string[])].sort()).toEqual(['A', 'B'])
    expect(states.map((s) => s.player_id).sort()).toEqual(['A', 'B'])
    expect(states.every((s) => s.score === 0 && s.rack.length === 7)).toBe(true)
    // the tiles in play and the bag are one deal: 7 per seat come out of the bag the same payload carries
    expect(tableOps).toEqual([])
  })

  it('the remaining bag is part of the deal: bag + racks are exactly the tile distribution (no missing, no duplicated tile)', async () => {
    const { supabase, rpcCalls } = makeMockSupabase({ status: 'started' })
    await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])
    const row = rpcCalls[0].args.p_session_row as { bag?: string[] }
    const states = rpcCalls[0].args.p_state_rows as { rack: string[] }[]
    expect(Array.isArray(row.bag)).toBe(true)
    const dealt = [...(row.bag ?? []), ...states.flatMap((s) => s.rack)].sort()
    const distribution = tileSetForDictionary(SCRABBLE_DEFAULT_DICTIONARY).distribution
    const expected = Object.entries(distribution)
      .flatMap(([letter, n]) => Array.from({ length: n as number }, () => letter))
      .sort()
    expect(dealt).toEqual(expected)
  })

  it('a stale start on a game that is no longer waiting is refused', async () => {
    const { supabase } = makeMockSupabase({ status: 'not_waiting' })
    expect(await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).toEqual({ error: 'Game already in progress' })
  })

  it('settings that changed after they were read are reported, not an internal error', async () => {
    const { supabase } = makeMockSupabase({ status: 'settings_changed' })
    expect(await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).toEqual({
      error: 'Game settings changed — please start again.',
    })
  })

  it('a seat whose player row is gone (a leave cleaning up the lobby) fails the deal', async () => {
    const { supabase } = makeMockSupabase({ status: 'invalid', reason: 'state_row' })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).error).toBeTruthy()
  })

  it('a failed settings read stops the deal: no defaults are dealt (wrong clock, dictionary or timer)', async () => {
    const { supabase, rpcCalls } = makeMockSupabase({ status: 'started' }, { failSettings: true })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).error).toBe(INTERNAL_ERROR_MESSAGE)
    expect(rpcCalls).toHaveLength(0)
  })

  it('a database failure is the generic error', async () => {
    const { supabase } = makeMockSupabase({ rpcError: 'boom' })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('rejects an out-of-range player count before touching the database', async () => {
    const { supabase, rpcCalls, fromCalls } = makeMockSupabase({ status: 'started' })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A'])).error).toMatch(/players to start/)
    expect(rpcCalls).toHaveLength(0)
    expect(fromCalls).toEqual([])
  })
})
