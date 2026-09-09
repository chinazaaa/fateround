import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GAME_CODE,
  HOST_TOKEN,
  PLAYER_ID,
  WRONG_TOKEN,
  codeParams,
  gameRow,
  jsonRequest,
  makeSupabaseStub,
} from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of
 * POST /api/games/[code]/whot-admit.
 *
 * Ladder: 404 → 403 → game-TYPE 400 → status 400 → session-expiry 400. The type gate
 * sits between the token check and the status check, so the combined wrong-type +
 * wrong-status case pins that the TYPE error is what a caller sees.
 */

vi.mock('server-only', () => ({}))

const liveGame = (overrides: Record<string, unknown> = {}) =>
  gameRow({
    status: 'active',
    game_type: 'whot',
    session_started_at: new Date().toISOString(),
    game_duration_seconds: 3600,
    ...overrides,
  })

let game: Record<string, unknown> | null = liveGame()

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

// Only the seat-and-deal work is stubbed; the session-expiry predicate stays real
// because it is part of the guard ladder being pinned.
vi.mock('@/lib/whot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/whot')>()
  return { ...actual, admitWhotPlayer: async () => ({ error: null, status: 200 }) }
})

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = liveGame()
})

const post = (body: unknown) => POST(jsonRequest(`/api/games/${GAME_CODE}/whot-admit`, body), codeParams())

const STATUS_ERROR = 'Players can only be dealt in while the game is in progress'

describe('POST /api/games/[code]/whot-admit — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await post({ hostToken: '', playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post({ hostToken: WRONG_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await post({ hostToken: WRONG_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-Whot game with 400 "Not a Whot game"', async () => {
    game = liveGame({ game_type: 'smash_marry_kill' })
    const res = await post({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Whot game' })
  })

  it('rejects a non-active Whot game with the in-progress-only 400', async () => {
    game = liveGame({ status: 'waiting' })
    const res = await post({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: STATUS_ERROR })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = liveGame({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a Whot game' })
  })

  it('reports 403 before either 400 — a wrong token on a wrong-type, wrong-status game', async () => {
    game = liveGame({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post({ hostToken: WRONG_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('authorizes the real host on an active Whot game and deals the player in', async () => {
    const res = await post({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})
