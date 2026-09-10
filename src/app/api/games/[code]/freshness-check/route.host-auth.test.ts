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
 * Characterization of the host-authorization branch of POST /api/games/[code]/freshness-check.
 *
 * This route does NOT use `hostActionSchema`: it hand-parses the body and answers a missing
 * token with its own 400 "Missing hostToken", and a malformed body with 400 "Invalid input".
 * Both differ from every other route in this batch, so both are pinned.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  players: () => ({ data: [], error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post

// The route modules pull in large dependency graphs; the one-time import gets its own
// generous budget so it doesn't trip the default hook timeout under a full-suite run.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting' })
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/freshness-check`, body), codeParams())

describe('POST /api/games/[code]/freshness-check — host authorization', () => {
  it('rejects an absent hostToken with 400 "Missing hostToken"', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing hostToken' })
  })

  it('rejects an empty hostToken with the same 400 "Missing hostToken"', async () => {
    const res = await post({ hostToken: '' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing hostToken' })
  })

  it('rejects a non-string hostToken with 400 "Missing hostToken"', async () => {
    const res = await post({ hostToken: 12345 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing hostToken' })
  })

  it('rejects an empty request body with 400 "Invalid input"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' })
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

  it('rejects a non-waiting game with 400 "Game not in waiting state"', async () => {
    game = gameRow({ status: 'active' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game not in waiting state' })
  })

  it('authorizes the real host on a waiting game and returns the empty freshness result', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      fresh: true,
      totalPool: 0,
      seenByMost: 0,
      seenPercent: 0,
      authenticatedPlayers: 0,
      totalPlayers: 0,
    })
  })
})
