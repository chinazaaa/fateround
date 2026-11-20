import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * The host's "end game" on a Word Rush game must take the same durable post-finish bookkeeping lease as
 * every other finish path: Play Again deletes the rows the bookkeeping reads, so a host finish that ran
 * it untracked would let a replay delete them mid-read.
 */
const deferred: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))
vi.mock('server-only', () => ({}))

let game: Record<string, unknown> = gameRow({ status: 'active', game_type: 'word_rush' })
const resultReasonUpdates: unknown[] = []
const supabase = makeSupabaseStub({
  games: ({ op, payload }) => {
    if (op === 'update') {
      resultReasonUpdates.push(payload)
      return { data: null, error: null }
    }
    return { data: game, error: null }
  },
  rounds: () => ({ data: null, error: null }),
})
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))
vi.mock('@/lib/word-rush-server', () => ({ finishWordRushGameEarly: async () => ({}) }))

const markGameFinished = vi.fn()
vi.mock('@/lib/game-finish', () => ({ markGameFinished: (...a: unknown[]) => markGameFinished(...a) }))

type Post = typeof import('./route').POST
let POST: Post
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'word_rush' })
  deferred.length = 0
  resultReasonUpdates.length = 0
  markGameFinished.mockReset()
  markGameFinished.mockResolvedValue({ error: null, won: true })
})

const post = () => POST(jsonRequest(`/api/games/${GAME_CODE}/finish-game`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/finish-game — Word Rush bookkeeping', () => {
  it('finishes a Word Rush game with the durable bookkeeping tracked', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(markGameFinished.mock.calls[0][3]).toEqual({ trackBookkeeping: true })
  })

  it('does not track the bookkeeping of any other game type', async () => {
    game = gameRow({ status: 'active', game_type: 'trivia' })
    await post()
    expect(markGameFinished.mock.calls[0][3]).toEqual({ trackBookkeeping: false })
  })

  it('does not stamp host_ended over a game another request already finished (lost flip)', async () => {
    markGameFinished.mockResolvedValue({ error: null, won: false })
    const res = await post()
    expect(res.status).toBe(200)
    expect(resultReasonUpdates).toEqual([])
  })

  it("stamps host_ended when the host's own finish won and there was no winner", async () => {
    await post()
    expect(resultReasonUpdates).toEqual([{ result_reason: 'host_ended' }])
  })
})
