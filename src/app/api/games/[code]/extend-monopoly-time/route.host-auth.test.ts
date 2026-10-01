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
 * Characterization of the host-authorization branch of POST /api/games/[code]/extend-monopoly-time.
 *
 * This route has NO status gate at all — the check after the token is a game-TYPE check
 * ("Not an Estate Kings game"). A finished Estate Kings game is therefore still accepted
 * by the authorization triplet; that is pinned below so a swap to any `assertHost*`
 * wrapper (all of which enforce a status allow-list) cannot silently add a 400.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'monopoly' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/monopoly', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/monopoly')>()),
  extendMonopolyGameDuration: async () => ({ error: null, newDurationSeconds: 1800 }),
}))

type Post = typeof import('./route').POST
let POST: Post

// The route modules pull in large dependency graphs; the one-time import gets its own
// generous budget so it doesn't trip the default hook timeout under a full-suite run.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'monopoly' })
})

const post = (body: Record<string, unknown> | string) =>
  POST(
    jsonRequest(
      `/api/games/${GAME_CODE}/extend-monopoly-time`,
      typeof body === 'string' ? body : { extensionSeconds: 300, ...body }
    ),
    codeParams()
  )

describe('POST /api/games/[code]/extend-monopoly-time — host authorization', () => {
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

  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
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

  it('rejects a non-Estate-Kings game with 400 "Not an Estate Kings game"', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not an Estate Kings game' })
  })

  it('accepts a FINISHED Estate Kings game — this route has no status gate', async () => {
    game = gameRow({ status: 'finished', game_type: 'monopoly' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, game_duration_seconds: 1800 })
  })

  it('authorizes the real host on an active game and extends the timer', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, game_duration_seconds: 1800 })
  })
})
