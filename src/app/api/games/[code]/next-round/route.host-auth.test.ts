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

/** Characterization of the host-authorization branch of POST /api/games/[code]/next-round. */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', current_round_number: 1, rounds_count: 3 })

const supabase = makeSupabaseStub({
  games: ({ op }) => (op === 'update' ? { data: null, error: null } : { data: game, error: null }),
  rounds: ({ op }) => {
    // The activation write must report a matched row, or the route 404s on "Next round not found".
    if (op === 'update') return { data: [{ id: 'r-2' }], error: null }
    // No active round, and nothing special pending for the next one.
    return { data: null, error: null }
  },
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
  game = gameRow({ status: 'active', current_round_number: 1, rounds_count: 3 })
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/next-round`, body), codeParams())

describe('POST /api/games/[code]/next-round — host authorization', () => {
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

  it('rejects a non-active game with 400 "Game not active"', async () => {
    game = gameRow({ status: 'finished' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game not active' })
  })

  it('authorizes the real host on an active game and advances the round', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, nextRound: 2 })
  })
})
