import { describe, it, expect } from 'vitest'
import { initializeScrabbleGame } from './scrabble'
import { INTERNAL_ERROR_MESSAGE } from './api-errors'

// Dealing a round is ONE database call (`deal_scrabble_session`): the function owns the decisions that used to be
// scattered app-side statements. It refuses to re-deal a session that is still `playing` (a live game's scores must
// never be wiped; this also serializes overlapping starts), replaces the racks and the session together (a failed deal
// leaves the previous result intact), and rejects a seat whose player row is gone. These tests pin the app contract:
// exactly one rpc carries the whole deal, and each outcome maps to the right result.

type Outcome = { status: string; reason?: string }

function makeMockSupabase(outcome: Outcome | { rpcError: string }) {
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  const tableOps: string[] = []

  function chain(data: unknown): Promise<{ data: unknown; error: null }> & Record<string, unknown> {
    const p = Promise.resolve({ data, error: null }) as Promise<{ data: unknown; error: null }> &
      Record<string, unknown>
    p.eq = () => chain(data)
    p.order = () => chain(data)
    p.select = () => chain(data)
    p.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? null : data, error: null })
    return p
  }

  const supabase = {
    from(table: string) {
      return {
        select() {
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
  return { supabase: supabase as any, rpcCalls, tableOps }
}

describe('initializeScrabbleGame — one transactional deal', () => {
  it('sends the whole deal (session row + every seat) in a single deal_scrabble_session call and writes no table itself', async () => {
    const { supabase, rpcCalls, tableOps } = makeMockSupabase({ status: 'dealt' })
    expect(await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).toEqual({})
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('deal_scrabble_session')
    const row = rpcCalls[0].args.p_session_row as Record<string, unknown>
    const states = rpcCalls[0].args.p_state_rows as { player_id: string; rack: string[]; score: number }[]
    expect(row.phase).toBe('playing')
    expect([...(row.turn_order as string[])].sort()).toEqual(['A', 'B'])
    expect(states.map((s) => s.player_id).sort()).toEqual(['A', 'B'])
    expect(states.every((s) => s.score === 0 && s.rack.length === 7)).toBe(true)
    // the tiles in play and the bag are one deal: 7 per seat come out of the bag the same payload carries
    expect(tableOps).toEqual([])
  })

  it('refuses to re-deal a round that is still playing (score-wipe guard, overlapping starts)', async () => {
    const { supabase } = makeMockSupabase({ status: 'in_progress' })
    expect(await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).toEqual({ error: 'Game already in progress' })
  })

  it('a seat whose player row is gone (a leave cleaning up the lobby) fails the deal', async () => {
    const { supabase } = makeMockSupabase({ status: 'invalid', reason: 'state_row' })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).error).toBeTruthy()
  })

  it('a database failure is the generic error', async () => {
    const { supabase } = makeMockSupabase({ rpcError: 'boom' })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A', 'B'])).error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('rejects an out-of-range player count before touching the database', async () => {
    const { supabase, rpcCalls } = makeMockSupabase({ status: 'dealt' })
    expect((await initializeScrabbleGame(supabase, 'GAME1', ['A'])).error).toMatch(/players to start/)
    expect(rpcCalls).toHaveLength(0)
  })
})
