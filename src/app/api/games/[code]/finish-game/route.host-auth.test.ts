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
 * Characterization of the host-authorization branch of POST /api/games/[code]/finish-game.
 *
 * Note the status gate here is a two-status allow-list (`active` OR `waiting`) with the
 * message "Game already ended" — no `assertHost*` wrapper currently matches that pair.
 */

// `after()` is a Next runtime API; this route is wrapped in `withGameNotification`,
// which schedules the push through it.
const deferred: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (fn: () => Promise<unknown>) => {
    deferred.push(fn())
  },
}))
vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'anonymous_messages' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  rounds: () => ({ data: null, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

// The success path uses an anonymous-room game so the handler returns right after the
// finish call — far enough to prove authorization passed without exercising snapshots,
// trophies or tournament scoring.
vi.mock('@/lib/anonymous-messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/anonymous-messages')>()),
  finishAnonymousRoomSession: async () => ({ error: null, cleanupError: null }),
}))
vi.mock('@/lib/push', () => ({ notifyGameEvent: async () => {} }))

type Post = typeof import('./route').POST
let POST: Post

// The route modules pull in large dependency graphs; the one-time import gets its own
// generous budget so it doesn't trip the default hook timeout under a full-suite run.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'anonymous_messages' })
  deferred.length = 0
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/finish-game`, body), codeParams())

describe('POST /api/games/[code]/finish-game — host authorization', () => {
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

  it('rejects an already-finished game with 400 "Game already ended"', async () => {
    game = gameRow({ status: 'finished', game_type: 'anonymous_messages' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game already ended' })
  })

  it('accepts a lobby (waiting) game — the status gate allows active OR waiting', async () => {
    game = gameRow({ status: 'waiting', game_type: 'anonymous_messages' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('authorizes the real host on an active game and finishes it', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})
