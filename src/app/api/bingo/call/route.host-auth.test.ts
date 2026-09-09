import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, WRONG_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of POST /api/bingo/call.
 *
 * The ladder here is 404 → 403 → game-TYPE 400 → status 400: the type gate sits
 * BETWEEN the token check and the status check, so a swap to a status-gated helper
 * would flip which 400 a caller sees. The combined wrong-type + wrong-status case
 * below is what pins that precedence.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'bingo' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  bingo_called_numbers: ({ op }) => {
    if (op === 'insert') return { data: { game_id: 'ABCD', number: 7 }, error: null }
    return { data: [], error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'bingo' })
})

const post = (body: unknown) => POST(jsonRequest('/api/bingo/call', body))

describe('POST /api/bingo/call — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE, number: 7 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: '', number: 7 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN, number: 7 })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, number: 7 })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN, number: 7 })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-bingo game with 400 "Not a bingo game"', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, number: 7 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a bingo game' })
  })

  it('rejects a non-active bingo game with 400 "Game not active"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'bingo' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, number: 7 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game not active' })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, number: 7 })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a bingo game' })
  })

  it('authorizes the real host on an active bingo game and calls the number', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN, number: 7 })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, called: { game_id: 'ABCD', number: 7 } })
  })
})
