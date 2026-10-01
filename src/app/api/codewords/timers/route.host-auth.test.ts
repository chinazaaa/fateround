import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, WRONG_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of POST /api/codewords/timers.
 *
 * Ladder: 404 → 403 → game-TYPE 400 → status 400. The combined wrong-type +
 * wrong-status case pins which 400 wins.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting', game_type: 'codewords' })

const supabase = makeSupabaseStub({
  games: ({ op }) => {
    if (op === 'update') return { data: { id: 'ABCD', timer_seconds: 60 }, error: null }
    return { data: game, error: null }
  },
  codewords_boards: () => ({ data: null, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting', game_type: 'codewords' })
})

const post = (body: unknown) => POST(jsonRequest('/api/codewords/timers', body))

const STATUS_ERROR = 'Timers can only be changed in the lobby before the game starts'

describe('POST /api/codewords/timers — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: '', spymasterTimerSeconds: 60 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-codewords game with 400 "Not a codewords game"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('rejects a started codewords game with the lobby-only 400', async () => {
    game = gameRow({ status: 'active', game_type: 'codewords' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: STATUS_ERROR })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('reports 403 before either 400 — a wrong token on a wrong-type, wrong-status game', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects an empty update before touching the game row', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Nothing to update' })
  })

  it('authorizes the real host on a waiting codewords game and saves the timers', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, spymasterTimerSeconds: 60 })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, game: { id: 'ABCD', timer_seconds: 60 } })
  })
})
