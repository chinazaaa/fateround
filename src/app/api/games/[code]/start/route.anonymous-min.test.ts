import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST_TOKEN, GAME_CODE, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))

let roster: Array<Record<string, unknown>> = []
let updated = false

const supabase = makeSupabaseStub({
  games: ({ op, payload }) => {
    // The start claim (and its release) is a games update too; it is not the start write under test.
    if (op === 'update' && payload && 'start_claimed_at' in (payload as object)) {
      return { data: [{ id: 'ABCD' }], error: null }
    }
    if (op === 'update') updated = true
    return { data: gameRow({ status: 'waiting', game_type: 'anonymous_messages' }), error: null }
  },
  players: () => ({ data: roster, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  updated = false
})

const start = () => POST(jsonRequest(`/api/games/${GAME_CODE}/start`, { hostToken: HOST_TOKEN }), codeParams())
const p = (id: string, spectator: boolean) => ({ id, name: id, spectator, gender: 'both' })

describe('POST /api/games/[code]/start — anonymous room minimum', () => {
  it('does not count a watch-only viewer toward the 2-player minimum', async () => {
    roster = [p('a', false), p('v', true)]
    const res = await start()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Need at least 2 players to start' })
    expect(updated).toBe(false)
  })
})
