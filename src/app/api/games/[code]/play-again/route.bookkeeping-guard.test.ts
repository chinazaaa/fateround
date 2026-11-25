import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * A finish that still owes its post-finish bookkeeping (a host-left finish writes the durable marker for every game
 * type) must complete it BEFORE Play Again resets the game: the bookkeeping reads rows the reset deletes.
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

const writes: string[] = []
const supabase = makeSupabaseStub({
  games: ({ op }) => {
    if (op !== 'select') writes.push(op)
    return { data: gameRow({ status: 'finished', game_type: 'trivia' }), error: null }
  },
})
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
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/play-again`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/play-again — owed bookkeeping', () => {
  it.each(['held', 'retry', 'error'])(
    'refuses to reset while the previous finish is %s, and writes nothing',
    async (state) => {
      recover.mockResolvedValue({ state })
      const res = await post()
      expect(res.status).toBe(409)
      expect(writes).toEqual([])
    }
  )

  it.each(['none', 'done'])('lets the reset proceed once the bookkeeping is %s', async (state) => {
    recover.mockResolvedValue({ state })
    const res = await post()
    expect(res.status).not.toBe(409)
    expect(recover).toHaveBeenCalledTimes(1)
  })
})
