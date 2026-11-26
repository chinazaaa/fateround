import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * A finish that still owes its post-finish bookkeeping (a host-left finish writes the durable marker for every game
 * type) must complete it BEFORE Play Again resets the game: the bookkeeping reads rows the reset deletes. Two layers:
 *  - the snapshot check (`recoverFinishBookkeeping`): refuse while the previous finish owes something;
 *  - for a LIVE game, whose host-left finish can commit after that snapshot, the first write of the reset is one
 *    conditional UPDATE (still the same status, nothing owed) and every later write is gated on it matching.
 */

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

const recover = vi.hoisted(() => vi.fn())
vi.mock('@/lib/game-finish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/game-finish')>()),
  recoverFinishBookkeeping: recover,
}))

let current: Record<string, unknown> = gameRow({ status: 'finished', game_type: 'trivia' })
/** Whether the live-reset fence UPDATE (status -> waiting, only while active and nothing owed) matches a row. */
let fenceMatches = true
/** Every write to ANY table (`table:op`), so "nothing was touched" covers the whole reset, not only games. */
const writes: string[] = []
const resolvers = new Proxy({} as Record<string, never>, {
  get: (_t, table: string) => (call: { op: string; payload?: unknown }) => {
    if (call.op !== 'select') writes.push(`${table}:${call.op}`)
    if (table === 'games' && call.op === 'update') {
      const payload = call.payload as Record<string, unknown> | undefined
      // The fence is the only games update that carries nothing but `status`.
      if (payload && Object.keys(payload).join() === 'status') {
        return { data: fenceMatches ? [{ id: current.id }] : [], error: null }
      }
      return { data: { ...current, status: 'waiting' }, error: null }
    }
    if (table === 'games') return { data: current, error: null }
    return { data: null, error: null }
  },
}) as never
const supabase = makeSupabaseStub(resolvers)
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  recover.mockReset()
  writes.length = 0
  fenceMatches = true
  current = gameRow({ status: 'finished', game_type: 'trivia' })
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/play-again`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/play-again — owed bookkeeping (snapshot check)', () => {
  it.each(['held', 'retry', 'error'])(
    'refuses to reset while the previous finish is %s: 409 and NO write to any table',
    async (state) => {
      recover.mockResolvedValue({ state })
      const res = await post()
      expect(res.status).toBe(409)
      expect(writes).toEqual([])
    }
  )

  it.each(['none', 'done'])(
    'resets once the bookkeeping is %s: success, and the reset writes happened',
    async (state) => {
      recover.mockResolvedValue({ state })
      const res = await post()
      expect(res.status).toBe(200)
      expect(recover).toHaveBeenCalledTimes(1)
      // The reset really ran: the deletes of the finished session's rows and the final games update.
      expect(writes).toEqual(expect.arrayContaining(['votes:delete', 'rounds:delete', 'games:update']))
    }
  )
})

describe('POST /api/games/[code]/play-again — a live game is fenced by its first write', () => {
  beforeEach(() => {
    current = gameRow({ status: 'active', game_type: 'codewords' })
    recover.mockResolvedValue({ state: 'none' })
  })

  it('a host-left finish that committed after the snapshot makes the fence match nothing: 409, and nothing else is written', async () => {
    fenceMatches = false
    const res = await post()
    expect(res.status).toBe(409)
    // Only the (unmatched) fence ran: no delete of any table, no final reset update.
    expect(writes).toEqual(['games:update'])
  })

  it('when the fence matches, it is the FIRST write and the reset then runs', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(writes[0]).toBe('games:update')
    expect(writes).toEqual(expect.arrayContaining(['votes:delete', 'rounds:delete']))
    expect(writes.filter((w) => w === 'games:update')).toHaveLength(2)
  })

  it('a finished game needs no fence (nothing can finish it again): no extra games write before the deletes', async () => {
    current = gameRow({ status: 'finished', game_type: 'trivia' })
    const res = await post()
    expect(res.status).toBe(200)
    expect(writes.indexOf('votes:delete')).toBeLessThan(writes.indexOf('games:update'))
  })
})
