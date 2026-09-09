import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GAME_CODE,
  HOST_TOKEN,
  PLAYER_ID,
  WRONG_TOKEN,
  gameRow,
  jsonRequest,
  makeSupabaseStub,
} from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of POST /api/mahjong/penalty.
 *
 * NOTE the order: STATUS is checked **before** game type here, as in
 * /api/mahjong/next-hand. The combined wrong-type + wrong-status case pins that
 * "Game is not active" wins.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'mahjong' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

vi.mock('@/lib/mahjong', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mahjong')>()
  return { ...actual, processMahjongPenalty: async () => ({ error: null }) }
})

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'mahjong' })
})

const post = (body: unknown) => POST(jsonRequest('/api/mahjong/penalty', body))

const valid = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_CODE,
  hostToken: HOST_TOKEN,
  playerId: PLAYER_ID,
  penaltyType: 'chombo',
  ...overrides,
})

describe('POST /api/mahjong/penalty — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE, playerId: PLAYER_ID, penaltyType: 'chombo' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await post(valid({ hostToken: '' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post(valid({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post(valid())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await post(valid({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-active mahjong game with 400 "Game is not active"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'mahjong' })
    const res = await post(valid())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game is not active' })
  })

  it('rejects an active non-mahjong game with 400 "Not a Mahjong game"', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post(valid())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Mahjong game' })
  })

  it('reports the STATUS error before the TYPE error when both are wrong', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post(valid())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game is not active' })
  })

  it('authorizes the real host on an active mahjong game and records the penalty', async () => {
    const res = await post(valid())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})
