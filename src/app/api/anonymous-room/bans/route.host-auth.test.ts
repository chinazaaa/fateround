import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOST_TOKEN, PLAYER_ID, WRONG_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of /api/anonymous-room/bans.
 *
 * This route already has a local `assertHostAnonymousRoom` — a fourth private copy of the
 * same triplet, with an extra game-type check and a two-status allow-list
 * ("Players can only be muted during the lobby or an active session"). POST and DELETE
 * share it, so both are pinned. The game code arrives in the BODY (`gameId`), not the path.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'anonymous_messages' })
const BAN = { game_id: 'ABCD', player_id: PLAYER_ID, banned_until: '2099-01-01T00:00:00.000Z' }

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  anonymous_room_bans: () => ({ data: BAN, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

type Route = typeof import('./route')
let POST: Route['POST']
let DELETE: Route['DELETE']

// The route modules pull in large dependency graphs; the one-time import gets its own
// generous budget so it doesn't trip the default hook timeout under a full-suite run.
beforeAll(async () => {
  const mod = await import('./route')
  POST = mod.POST
  DELETE = mod.DELETE
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'anonymous_messages' })
})

const banBody = (over: Record<string, unknown> = {}) => ({
  gameId: 'ABCD',
  playerId: PLAYER_ID,
  durationMinutes: 5,
  ...over,
})

const post = (body: Record<string, unknown> | string) =>
  POST(jsonRequest('/api/anonymous-room/bans', typeof body === 'string' ? body : banBody(body)))

const del = (body: Record<string, unknown>) =>
  DELETE(jsonRequest('/api/anonymous-room/bans', { gameId: 'ABCD', playerId: PLAYER_ID, ...body }, 'DELETE'))

describe('POST /api/anonymous-room/bans — host authorization', () => {
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

  it('rejects a non-anonymous-room game with 400 "Not an anonymous room"', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not an anonymous room' })
  })

  it('rejects a finished room with 400 "Players can only be muted during the lobby or an active session"', async () => {
    game = gameRow({ status: 'finished', game_type: 'anonymous_messages' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Players can only be muted during the lobby or an active session',
    })
  })

  it('accepts a waiting room — the status gate allows waiting OR active', async () => {
    game = gameRow({ status: 'waiting', game_type: 'anonymous_messages' })
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, ban: BAN })
  })

  it('authorizes the real host on an active room and records the ban', async () => {
    const res = await post({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, ban: BAN })
  })
})

describe('DELETE /api/anonymous-room/bans — host authorization', () => {
  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await del({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await del({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a finished room with the same status message as POST', async () => {
    game = gameRow({ status: 'finished', game_type: 'anonymous_messages' })
    const res = await del({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Players can only be muted during the lobby or an active session',
    })
  })

  it('authorizes the real host on an active room and lifts the ban', async () => {
    const res = await del({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})
