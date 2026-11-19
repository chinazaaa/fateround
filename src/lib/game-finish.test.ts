import { describe, it, expect, vi, beforeEach } from 'vitest'

const award = vi.hoisted(() => vi.fn())
vi.mock('@/lib/room-points', () => ({ awardRoomGamePoints: award }))

// The head-to-head resolver has its own concerns and DB access; stub it so these
// tests isolate markGameFinished's own transition/award behavior.
const resolveH2H = vi.hoisted(() => vi.fn())
vi.mock('@/lib/tournament-h2h', () => ({ resolveHeadToHeadMatch: resolveH2H }))

// Likewise the school (class-ladder) resolver — stubbed so these tests isolate
// markGameFinished's own transition/award behavior.
const resolveSchool = vi.hoisted(() => vi.fn())
vi.mock('@/lib/tournament-school', () => ({ resolveSchoolMatch: resolveSchool }))

// And the Scrabble-knockout room resolver, same reason.
const resolveKnockout = vi.hoisted(() => vi.fn())
vi.mock('@/lib/tournament-scoring', () => ({ resolveKnockoutGroupRoom: resolveKnockout }))

// The trophy snapshot reads several tables of its own. Stubbed for the same reason as the
// resolvers above: these tests are about the finish TRANSITION, and its reads would otherwise
// show up in this file's shared call recorder as if the transition had made them.
const recordFacts = vi.hoisted(() => vi.fn())
vi.mock('@/lib/trophies/round-facts', () => ({ recordRoundFacts: recordFacts }))

import { markGameFinished, recoverAllFinishBookkeeping, recoverFinishBookkeeping } from './game-finish'

// Minimal Supabase stand-in: the games update builder is chainable and awaitable,
// resolving to the rows the (optional) CAS `.select()` would return.
function makeSupabase(rows: unknown[] | null, error: unknown = null) {
  const calls = { eqs: [] as Array<[string, unknown]>, selected: false }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  b.update = () => b
  b.eq = (col: string, val: unknown) => {
    calls.eqs.push([col, val])
    return b
  }
  b.select = () => {
    calls.selected = true
    return b
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b.then = (resolve: any, reject: any) => Promise.resolve({ data: rows, error }).then(resolve, reject)
  return { supabase: { from: () => b } as never, calls }
}

beforeEach(() => {
  award.mockReset()
  resolveH2H.mockReset()
  resolveSchool.mockReset()
  resolveKnockout.mockReset()
})

describe('markGameFinished', () => {
  it('with a roundGuard, flips via the RPC and only awards when the round still matched', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    const supabase = { rpc, from: vi.fn() } as never
    const guard = { rpc: 'rummy_finish_game_for_session', params: { p_session_id: 's1' } }

    const first = await markGameFinished(supabase, 'GAME', '2026-01-01T00:00:00.000Z', {
      onlyIfActive: true,
      roundGuard: guard,
    })
    expect(first.won).toBe(true)
    expect(rpc).toHaveBeenCalledWith('rummy_finish_game_for_session', {
      p_game_id: 'GAME',
      p_finished_at: '2026-01-01T00:00:00.000Z',
      p_session_id: 's1',
    })
    expect(award).toHaveBeenCalledTimes(1)

    const stale = await markGameFinished(supabase, 'GAME', undefined, { onlyIfActive: true, roundGuard: guard })
    expect(stale.won).toBe(false)
    expect(stale.error).toBeNull()
    expect(award).toHaveBeenCalledTimes(1)
  })

  it('guards the active→finished transition and awards points for the winner', async () => {
    const { supabase, calls } = makeSupabase([{ id: 'GAME' }])
    const res = await markGameFinished(supabase, 'GAME', undefined, { onlyIfActive: true })
    expect(res.error).toBeNull()
    expect(res.won).toBe(true)
    expect(calls.eqs).toContainEqual(['status', 'active'])
    expect(calls.selected).toBe(true)
    expect(award).toHaveBeenCalledTimes(1)
  })

  it('does not award when a concurrent finisher already won the CAS (no rows affected)', async () => {
    const { supabase } = makeSupabase([])
    const res = await markGameFinished(supabase, 'GAME', undefined, { onlyIfActive: true })
    expect(award).not.toHaveBeenCalled()
    // The loser must be able to TELL it lost: error is null either way, so callers that
    // only inspect `error` would treat this as their own successful finish.
    expect(res.error).toBeNull()
    expect(res.won).toBe(false)
  })

  it('awards unconditionally when onlyIfActive is not set (unchanged default)', async () => {
    const { supabase, calls } = makeSupabase(null)
    const res = await markGameFinished(supabase, 'GAME')
    expect(calls.eqs).not.toContainEqual(['status', 'active'])
    expect(calls.selected).toBe(false)
    expect(award).toHaveBeenCalledTimes(1)
    // No CAS was attempted, so every unguarded caller keeps reading a win.
    expect(res.won).toBe(true)
  })
})

describe('trackBookkeeping — durable, recoverable post-finish bookkeeping', () => {
  // Captures the games update payload and answers the three lease RPCs.
  function makeTracked(rpcs: Record<string, unknown>, rows: unknown[] = [{ id: 'GAME' }]) {
    const payloads: Array<Record<string, unknown>> = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.update = (v: Record<string, unknown>) => {
      payloads.push(v)
      return b
    }
    b.eq = () => b
    b.select = () => b
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    b.then = (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject)
    const rpcCalls: Array<[string, Record<string, unknown>]> = []
    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args])
      return { data: rpcs[fn], error: null }
    })
    return { supabase: { from: () => b, rpc } as never, payloads, rpcCalls }
  }

  it('records the marker in the SAME update that flips the game, then runs the bookkeeping under the lease', async () => {
    const { supabase, payloads, rpcCalls } = makeTracked({
      claim_finish_bookkeeping: { status: 'claimed', finished_at: '2026-01-01T00:00:00.000Z', attempts: 0 },
      complete_finish_bookkeeping: 'completed',
    })
    const res = await markGameFinished(supabase, 'GAME', '2026-01-01T00:00:00.000Z', {
      onlyIfActive: true,
      trackBookkeeping: true,
    })
    expect(payloads[0]).toEqual({
      status: 'finished',
      finished_at: '2026-01-01T00:00:00.000Z',
      finish_bookkeeping: { finished_at: '2026-01-01T00:00:00.000Z', attempts: 0 },
    })
    expect(rpcCalls.map(([fn]) => fn)).toEqual(['claim_finish_bookkeeping', 'complete_finish_bookkeeping'])
    expect(res).toMatchObject({ won: true, bookkeeping: 'done' })
    expect(award).toHaveBeenCalledTimes(1)
  })

  it('leaves untracked finishes exactly as they were: no marker, no lease RPCs', async () => {
    const { supabase, payloads, rpcCalls } = makeTracked({})
    const res = await markGameFinished(supabase, 'GAME', '2026-01-01T00:00:00.000Z', { onlyIfActive: true })
    expect(payloads[0]).toEqual({ status: 'finished', finished_at: '2026-01-01T00:00:00.000Z' })
    expect(rpcCalls).toEqual([])
    expect(res.bookkeeping).toBeUndefined()
  })

  it('a lost flip runs no bookkeeping (the winner owns it)', async () => {
    const { supabase, rpcCalls } = makeTracked({}, [])
    const res = await markGameFinished(supabase, 'GAME', '2026-01-01T00:00:00.000Z', {
      onlyIfActive: true,
      trackBookkeeping: true,
    })
    expect(res.won).toBe(false)
    expect(rpcCalls).toEqual([])
    expect(award).not.toHaveBeenCalled()
  })

  it('does not run the bookkeeping when another runner holds the lease, and reports held', async () => {
    const { supabase } = makeTracked({ claim_finish_bookkeeping: { status: 'held' } })
    expect(await recoverFinishBookkeeping(supabase, 'GAME')).toEqual({ state: 'held' })
    expect(award).not.toHaveBeenCalled()
  })

  it('reports none when nothing is owed', async () => {
    const { supabase } = makeTracked({ claim_finish_bookkeeping: { status: 'none' } })
    expect(await recoverFinishBookkeeping(supabase, 'GAME')).toEqual({ state: 'none' })
  })

  it('a step that throws keeps the bookkeeping owed (fail, not complete) and a retry is reported', async () => {
    recordFacts.mockRejectedValueOnce(new Error('snapshot down'))
    const { supabase, rpcCalls } = makeTracked({
      claim_finish_bookkeeping: { status: 'claimed', finished_at: '2026-01-01T00:00:00.000Z', attempts: 0 },
      fail_finish_bookkeeping: 'retry',
    })
    const res = await recoverFinishBookkeeping(supabase, 'GAME')
    expect(res.state).toBe('retry')
    expect(rpcCalls.map(([fn]) => fn)).toEqual(['claim_finish_bookkeeping', 'fail_finish_bookkeeping'])
  })

  it('reports done when the attempt cap drops the marker, so a replay is not blocked forever', async () => {
    recordFacts.mockRejectedValueOnce(new Error('snapshot down'))
    const { supabase } = makeTracked({
      claim_finish_bookkeeping: { status: 'claimed', finished_at: '2026-01-01T00:00:00.000Z', attempts: 4 },
      fail_finish_bookkeeping: 'gave_up',
    })
    expect((await recoverFinishBookkeeping(supabase, 'GAME')).state).toBe('done')
  })

  it('a runner whose lease was taken over (not_owner) reports held, never done', async () => {
    const { supabase } = makeTracked({
      claim_finish_bookkeeping: { status: 'claimed', finished_at: '2026-01-01T00:00:00.000Z', attempts: 0 },
      complete_finish_bookkeeping: 'not_owner',
    })
    expect((await recoverFinishBookkeeping(supabase, 'GAME')).state).toBe('held')
  })

  it('surfaces an RPC failure as error instead of pretending the bookkeeping is done', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc down' } })) } as never
    expect(await recoverFinishBookkeeping(supabase, 'GAME')).toEqual({ state: 'error', error: 'rpc down' })
  })

  it('the sweep reports recovered / pending / failed per game', async () => {
    const claims = [{ status: 'claimed', finished_at: '2026-01-01T00:00:00.000Z' }, { status: 'held' }]
    const supabase = {
      from: () => ({
        select: () => ({
          not: () => ({ order: () => ({ limit: async () => ({ data: [{ id: 'A' }, { id: 'B' }], error: null }) }) }),
        }),
      }),
      rpc: vi.fn(async (fn: string) => {
        if (fn === 'claim_finish_bookkeeping') return { data: claims.shift(), error: null }
        return { data: 'completed', error: null }
      }),
    } as never
    expect(await recoverAllFinishBookkeeping(supabase)).toEqual({ recovered: 1, pending: 1, failed: 0 })
  })
})
