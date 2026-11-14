import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, PLAYER_ID, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * The spymaster seat is enforced by a partial unique index (game_id, team) where
 * role = 'spymaster'. When parallel claims race past the route's check-then-upsert, the
 * loser's upsert fails with 23505, which must read as the same 400 the sequential refusal
 * returns, not a 500.
 */

vi.mock('server-only', () => ({}))

let upsertError: { code: string; message: string } | null = null

const supabase = makeSupabaseStub({
  games: () => ({
    data: gameRow({ status: 'waiting', game_type: 'codewords', codewords_player_picks: true }),
    error: null,
  }),
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
    jsonRequest('/api/codewords/role', {
      gameId: GAME_CODE,
      resumeToken: 'resume-token',
      team: 'red',
      role: 'spymaster',
      ...overrides,
    })
  )

describe('POST /api/codewords/role — spymaster unique index', () => {
  it('maps a 23505 on a spymaster claim to 400 "already has a spymaster"', async () => {
    upsertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await post()
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Red team already has a spymaster' })
  })

  it('names the blue team for a blue claim', async () => {
    upsertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    const res = await post({ team: 'blue' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Blue team already has a spymaster' })
  })

  it('keeps other DB errors as a generic 500', async () => {
    upsertError = { code: '23503', message: 'foreign key violation' }
    const res = await post()
    expect(res.status).toBe(500)
  })

  it('does not treat a 23505 on an operative upsert as a spymaster conflict', async () => {
    upsertError = { code: '23505', message: 'duplicate key value' }
    const res = await post({ role: 'operative' })
    expect(res.status).toBe(500)
  })

  it('succeeds when the upsert succeeds', async () => {
    const res = await post()
    expect(res.status).toBe(200)
  })
})
