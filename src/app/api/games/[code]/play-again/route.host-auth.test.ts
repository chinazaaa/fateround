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
 * Characterization of the host-authorization branch of POST /api/games/[code]/play-again.
 *
 * There is NO status check adjacent to the token check here. The status gate is a much
 * later, game-type-aware `canReturnToLobby` computation whose failure message is
 * "Game must be finished before playing again". Any centralization must not fold that
 * into the auth helper — the allowed-status set is not static for this route.
 */

const deferred: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))
vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting', replay_pending: true })

const supabase = makeSupabaseStub({
  // The success path takes the "exit the ready-up ring" early return, which writes
  // replay_pending:false and echoes the row back.
  games: ({ op }) =>
    op === 'update'
      ? { data: { ...gameRow({ status: 'waiting' }), replay_pending: false }, error: null }
      : { data: game, error: null },
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
  game = gameRow({ status: 'waiting', replay_pending: true })
  deferred.length = 0
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/play-again`, body), codeParams())

describe('POST /api/games/[code]/play-again — host authorization', () => {
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

  it('rejects a mid-game replay with 400 "Game must be finished before playing again"', async () => {
    game = gameRow({ status: 'active' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game must be finished before playing again' })
  })

  it('authorizes the real host and takes the "exit the ready-up ring" path', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; game: { replay_pending: boolean } }
    expect(body.success).toBe(true)
    expect(body.game.replay_pending).toBe(false)
  })
})
