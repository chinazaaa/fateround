import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST_TOKEN, GAME_CODE, codeParams, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Overlapping starts (host double-tap, client retry). The status check in the route is not atomic
 * with the session writes, so every overlapping request used to seed the game: Trivia, Two Truths,
 * Quiplash, Word Hunt, ... ended up with their rounds twice (10 became 30, several "active" at
 * once) and the others answered the loser with a 500. The route now claims the lobby with one
 * conditional update; a request that loses the claim must stop before it reads or writes anything.
 */

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => {},
}))
vi.mock('server-only', () => ({}))

let claimRows: Array<{ id: string }> = []
let playersRead = 0
const claimUpdates: Array<Record<string, unknown>> = []

const supabase = makeSupabaseStub({
  games: ({ op, payload }) => {
    if (op === 'update') {
      claimUpdates.push(payload as Record<string, unknown>)
      const p = payload as Record<string, unknown>
      // The claim answers with the rows it won; the release only needs to not fail.
      return { data: p.start_claimed_at ? claimRows : [{ id: 'ABCD' }], error: null }
    }
    return { data: gameRow({ status: 'waiting', game_type: 'trivia' }), error: null }
  },
  players: () => {
    playersRead += 1
    return { data: [], error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  claimRows = [{ id: 'ABCD' }]
  playersRead = 0
  claimUpdates.length = 0
})

const start = () => POST(jsonRequest(`/api/games/${GAME_CODE}/start`, { hostToken: HOST_TOKEN }), codeParams())

describe('POST /api/games/[code]/start — overlapping starts', () => {
  it('turns away a start that lost the claim before it touches the session', async () => {
    claimRows = []
    const res = await start()
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'Game already started' })
    expect(playersRead).toBe(0)
    // Only the failed claim; there is nothing to release.
    expect(claimUpdates).toHaveLength(1)
    expect(claimUpdates[0].start_claimed_at).toEqual(expect.any(String))
  })

  it('runs the start for the request that won the claim, then releases it', async () => {
    const res = await start()
    // No players seated, so the start stops at its first check — but only the winner got there.
    expect(res.status).toBe(400)
    expect(playersRead).toBe(1)
    expect(claimUpdates).toHaveLength(2)
    expect(claimUpdates[1]).toEqual({ start_claimed_at: null })
  })
})
