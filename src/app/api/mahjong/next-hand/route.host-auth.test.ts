import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, WRONG_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of POST /api/mahjong/next-hand.
 *
 * NOTE the order: this route checks STATUS **before** game type — the opposite of the
 * bingo/codewords routes. The combined wrong-type + wrong-status case below pins that
 * a caller with both wrong sees "Game is not active", not "Not a Mahjong game".
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'mahjong' })

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

// The hand-advance engine is out of scope here; stub it so the success case exercises
// the authorization ladder only.
vi.mock('@/lib/mahjong', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mahjong')>()
  return { ...actual, processMahjongNextHand: async () => ({ error: null }) }
})

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'mahjong' })
})

const post = (body: unknown) => POST(jsonRequest('/api/mahjong/next-hand', body))

describe('POST /api/mahjong/next-hand — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: '' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-active mahjong game with 400 "Game is not active"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'mahjong' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game is not active' })
  })

  it('rejects an active non-mahjong game with 400 "Not a Mahjong game"', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Mahjong game' })
  })

  it('reports the STATUS error before the TYPE error when both are wrong', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Game is not active' })
  })

  it('authorizes the real host on an active mahjong game and advances the hand', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})
