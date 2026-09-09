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
 * Characterization of the host-authorization branch of POST /api/games/[code]/lobby-settings.
 *
 * Two behaviours worth noting before anything is centralized:
 *  - this route guards the body with `parseJsonBody`, so an empty body returns
 *    400 "Invalid or empty request body" (pinned below);
 *  - the "nothing to update" check runs BEFORE the game is even loaded, so a request with
 *    no settings fields gets 400 "Nothing to update" even with a wrong token or a
 *    nonexistent game. Authorization is not the first gate here.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

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

/** `is_public` is present on every request so the pre-auth "Nothing to update" gate passes. */
const post = (body: Record<string, unknown> | string) =>
  POST(
    jsonRequest(
      `/api/games/${GAME_CODE}/lobby-settings`,
      typeof body === 'string' ? body : { is_public: true, ...body },
      'POST'
    ),
    codeParams()
  )

describe('POST /api/games/[code]/lobby-settings — host authorization', () => {
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

  it('rejects a started game with 400 "Settings can only be changed in the lobby before the game starts"', async () => {
    game = gameRow({ status: 'active' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Settings can only be changed in the lobby before the game starts',
    })
  })

  it('answers "Nothing to update" BEFORE authorizing — a wrong token never reaches the 403', async () => {
    const res = await POST(
      jsonRequest(`/api/games/${GAME_CODE}/lobby-settings`, { hostToken: WRONG_TOKEN }),
      codeParams()
    )
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Nothing to update' })
  })

  it('authorizes the real host on a waiting game and reaches the game-type gate', async () => {
    // `smash_marry_kill` has no lobby-settings support, so the first thing past the
    // auth triplet is this 400 — proof authorization passed.
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'This game type does not support lobby settings here' })
  })
})
