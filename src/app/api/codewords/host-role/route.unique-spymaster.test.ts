import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Two host assignments can both see an empty spymaster seat and skip the demotion. The partial
 * unique index (game_id, team) where role = 'spymaster' rejects the second upsert with 23505, which
 * must read as the same refusal a sequential request gets, not a 500.
 */

vi.mock('server-only', () => ({}))

let upsertError: { code: string; message: string } | null = null

const supabase = makeSupabaseStub({
  games: () => ({ data: gameRow({ status: 'waiting', game_type: 'codewords' }), error: null }),
  players: () => ({ data: { id: PLAYER_ID }, error: null }),
  codewords_player_roles: ({ op }) => {
    if (op === 'upsert') {
      return upsertError
        ? { data: null, error: upsertError }
        : { data: { game_id: 'ABCD', player_id: PLAYER_ID, team: 'red', role: 'spymaster' }, error: null }
    }
    return { data: null, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  upsertError = null
})

const post = (overrides: Record<string, unknown> = {}) =>
  POST(
    jsonRequest('/api/codewords/host-role', {
      gameId: GAME_CODE,
      hostToken: HOST_TOKEN,
      playerId: PLAYER_ID,
      team: 'red',
      role: 'spymaster',
      ...overrides,
    })
  )

describe('POST /api/codewords/host-role — spymaster unique index', () => {
  it('maps a 23505 on a spymaster assignment to 400 "already has a spymaster"', async () => {
    upsertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await post()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Red team already has a spymaster' })
  })

  it('names the blue team for a blue assignment', async () => {
    upsertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await post({ team: 'blue' })
    await expect(res.json()).resolves.toEqual({ error: 'Blue team already has a spymaster' })
  })

  it('keeps other errors, and a 23505 on an operative upsert, as a generic 500', async () => {
    upsertError = { code: '23503', message: 'foreign key violation' }
    expect((await post()).status).toBe(500)
    upsertError = { code: '23505', message: 'duplicate key value' }
    expect((await post({ role: 'operative' })).status).toBe(500)
  })

  it('succeeds when the upsert succeeds', async () => {
    expect((await post()).status).toBe(200)
  })
})
