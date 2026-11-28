import { describe, it, expect } from 'vitest'
import { initializeUnoGame } from './uno'
import { INTERNAL_ERROR_MESSAGE } from './api-errors'

// Starting a round is ONE database call (`start_uno_game`): the function deals AND activates the game in a single
// transaction, so there is no half-started room to resume and no stale deal to clean up from the app. These tests pin
// the app contract: exactly one rpc carries the whole deal, no table is written by the app, and each outcome maps to the
// right result.

type Outcome = { status: string; reason?: string }
type Result = { data: unknown; error: unknown }

function makeMock(opts: { outcome?: Outcome | { rpcError: string }; gameError?: boolean; teamMode?: boolean }) {
  const ops: string[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []
  function chain(result: Result): Promise<Result> & Record<string, unknown> {
    const p = Promise.resolve(result) as Promise<Result> & Record<string, unknown>
    p.eq = () => chain(result)
    p.select = () => chain(result)
    p.maybeSingle = () => Promise.resolve(result)
    return p
  }
  const outcome = opts.outcome ?? { status: 'started' }
  const supabase = {
    from(table: string) {
      return {
        select() {
          if (table === 'games') {
            return opts.gameError
              ? chain({ data: null, error: { message: 'boom' } })
              : chain({
                  data: { timer_seconds: 0, uno_team_mode: opts.teamMode === true, uno_mode: 'classic' },
                  error: null,
                })
          }
          if (table === 'players')
            return chain({
              data: [
                { id: 'A', name: 'A' },
                { id: 'B', name: 'B' },
              ],
              error: null,
            })
          return chain({ data: null, error: null })
        },
        insert() {
          ops.push(`${table}:insert`)
          return chain({ data: null, error: null })
        },
        update() {
          ops.push(`${table}:update`)
          return chain({ data: null, error: null })
        },
        delete() {
          ops.push(`${table}:delete`)
          return chain({ data: null, error: null })
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
  return { supabase: supabase as any, ops, rpcCalls }
}

describe('initializeUnoGame — one transactional start', () => {
  it('sends the whole deal (session row + every hand) in a single start_uno_game call and writes no table itself', async () => {
    const { supabase, ops, rpcCalls } = makeMock({})
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({})
    expect(ops).toEqual([])
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('start_uno_game')
    const session = rpcCalls[0].args.p_session_row as Record<string, unknown>
    const hands = rpcCalls[0].args.p_hand_rows as { player_id: string; cards: unknown[]; player_order: number }[]
    expect(session.phase).toBe('playing')
    expect(session).not.toHaveProperty('game_id')
    expect([...(session.turn_order as string[])].sort()).toEqual(['A', 'B'])
    expect(hands.map((h) => h.player_id).sort()).toEqual(['A', 'B'])
    expect(hands.every((h) => h.cards.length === 7)).toBe(true)
    // each hand's player_order is ITS seat index in turn_order (either shuffled order is valid)
    for (const h of hands) expect(h.player_order).toBe((session.turn_order as string[]).indexOf(h.player_id))
    // the hands are dealt in turn order: the seat at index i holds hand row i
    expect(hands.map((h) => h.player_id)).toEqual(session.turn_order)
  })

  it('a start on a game that is no longer waiting (another start won) is refused and deals nothing itself', async () => {
    const { supabase, ops } = makeMock({ outcome: { status: 'not_waiting' } })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({ error: 'Game already in progress' })
    expect(ops).toEqual([])
  })

  it('a player who joined after the roster was read is reported (nothing was started), not an internal error', async () => {
    const { supabase } = makeMock({ outcome: { status: 'invalid', reason: 'roster_changed' } })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({
      error: 'The player list changed — please start again.',
    })
  })

  it('a seat whose player row is gone fails the start', async () => {
    const { supabase } = makeMock({ outcome: { status: 'invalid', reason: 'hand_row' } })
    expect((await initializeUnoGame(supabase, 'G', ['A', 'B'])).error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('a database failure is the generic error', async () => {
    const { supabase } = makeMock({ outcome: { rpcError: 'boom' } })
    expect((await initializeUnoGame(supabase, 'G', ['A', 'B'])).error).toBe(INTERNAL_ERROR_MESSAGE)
  })

  it('a failed settings read stops the deal (never dealt as a classic game)', async () => {
    const { supabase, rpcCalls } = makeMock({ gameError: true })
    expect(await initializeUnoGame(supabase, 'G', ['A', 'B'])).toEqual({ error: INTERNAL_ERROR_MESSAGE })
    expect(rpcCalls).toHaveLength(0)
  })

  it('Team-Up needs exactly four players before anything is sent', async () => {
    const { supabase, rpcCalls } = makeMock({ teamMode: true })
    expect((await initializeUnoGame(supabase, 'G', ['A', 'B'])).error).toMatch(/Team-Up needs exactly/)
    expect(rpcCalls).toHaveLength(0)
  })
})
