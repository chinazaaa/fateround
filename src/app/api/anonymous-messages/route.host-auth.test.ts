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
 * Characterization of the host-authorization branch of DELETE /api/anonymous-messages.
 *
 * Ladder: 404 → 403 → game-TYPE 400 → status 400. The status gate is CONDITIONAL — it
 * only applies to `anonymous_messages` games, so a secret-message board is deletable in
 * any state. Both halves of that are pinned, plus the combined wrong-type + wrong-status
 * case that fixes which 400 wins.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'active', game_type: 'anonymous_messages' })
let message: Record<string, unknown> | null = { id: PLAYER_ID }

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  anonymous_messages: ({ op }) => {
    if (op === 'delete') return { data: null, error: null }
    return { data: message, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => supabase }))

type Delete = typeof import('./route').DELETE
let DELETE: Delete

beforeAll(async () => {
  DELETE = (await import('./route')).DELETE
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'active', game_type: 'anonymous_messages' })
  message = { id: PLAYER_ID }
})

const del = (body: unknown) => DELETE(jsonRequest('/api/anonymous-messages', body, 'DELETE'))

const valid = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_CODE,
  messageId: PLAYER_ID,
  hostToken: HOST_TOKEN,
  ...overrides,
})

describe('DELETE /api/anonymous-messages — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await del({ gameId: GAME_CODE, messageId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 "hostToken is required"', async () => {
    const res = await del(valid({ hostToken: '' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'hostToken is required' })
  })

  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await del('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await del(valid({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await del(valid())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await del(valid({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-message-board game with 400 "Not a message board"', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill' })
    const res = await del(valid())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a message board' })
  })

  it('rejects a non-active anonymous board with the active-session-only 400', async () => {
    game = gameRow({ status: 'finished', game_type: 'anonymous_messages' })
    const res = await del(valid())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Messages can only be removed during an active session' })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = gameRow({ status: 'finished', game_type: 'smash_marry_kill' })
    const res = await del(valid())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a message board' })
  })

  it('does NOT apply the active-only status gate to a secret message board', async () => {
    game = gameRow({ status: 'finished', game_type: 'secret_message' })
    const res = await del(valid())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })

  it('returns 404 "Message not found" when the message is missing', async () => {
    message = null
    const res = await del(valid())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Message not found' })
  })

  it('authorizes the real host on an active anonymous board and deletes the message', async () => {
    const res = await del(valid())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
  })
})
