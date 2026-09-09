import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GAME_CODE,
  HOST_TOKEN,
  WRONG_TOKEN,
  codeParams,
  gameRow,
  jsonRequest,
  makeSupabaseStub,
} from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of POST /api/games/[code]/start.
 *
 * The status message here is "Game already started" — NOT the "Game has already started"
 * that `assertHostGame` returns for the same `waiting`-only allow-list. Swapping this
 * route onto the helper changes the string a host sees, so it is pinned literally.
 *
 * Like lobby-settings, this route calls `await req.json()` with no guard, so an empty
 * body rejects instead of returning 400.
 */

const deferred: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))
vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  // No players seated: the first check past the auth triplet, so a 400 here proves
  // authorization passed without running any of the per-game-type start logic.
  players: () => ({ data: [], error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

type Post = typeof import('./route').POST
let POST: Post

// The route modules pull in large dependency graphs; the one-time import gets its own
// generous budget so it doesn't trip the default hook timeout under a full-suite run.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting' })
  deferred.length = 0
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/start`, body), codeParams())

describe('POST /api/games/[code]/start — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await post({ hostToken: '' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('THROWS on an empty request body — this route has no parseJsonBody guard', async () => {
    await expect(post('')).rejects.toThrow()
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects an already-started game with 400 "Game already started" (not "Game has already started")', async () => {
    game = gameRow({ status: 'active' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game already started' })
  })

  it('rejects a finished game with the same 400 "Game already started"', async () => {
    game = gameRow({ status: 'finished' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game already started' })
  })

  it('authorizes the real host on a waiting game and reaches the player-count check', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Need at least one player to start' })
  })
})
