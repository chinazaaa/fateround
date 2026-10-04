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
 * Characterization of the host-authorization branch of POST + DELETE
 * /api/codewords/host-role.
 *
 * Ladder: 404 → 403 → game-TYPE 400 → status 400 (the status gate is
 * `codewordsAllowsPlayerChanges`, i.e. waiting|active). The two verbs share the
 * ladder but return DIFFERENT status-error strings, so both are pinned literally.
 */

vi.mock('server-only', () => ({}))

let game: Record<string, unknown> | null = gameRow({ status: 'waiting', game_type: 'codewords' })
let player: Record<string, unknown> | null = { id: PLAYER_ID }
let roleRow: Record<string, unknown> | null = { id: 'role-1', team: 'red' }

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  players: () => ({ data: player, error: null }),
  codewords_player_roles: ({ op }) => {
    if (op === 'upsert') return { data: { game_id: 'ABCD', player_id: PLAYER_ID, team: 'red' }, error: null }
    if (op === 'delete') return { data: null, error: null }
    return { data: roleRow, error: null }
  },
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

// Only the post-authorization team bookkeeping is stubbed; the status predicate
// (`codewordsAllowsPlayerChanges`) stays real because it IS the gate under test.
vi.mock('@/lib/codewords', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/codewords')>()
  return {
    ...actual,
    removeCodewordsPlayerRole: async () => ({ error: null }),
    reconcileCodewordsTeamAfterRemoval: async () => ({ error: null, outcome: { ended: false } }),
  }
})

type Post = typeof import('./route').POST
type Delete = typeof import('./route').DELETE
let POST: Post
let DELETE: Delete

beforeAll(async () => {
  const mod = await import('./route')
  POST = mod.POST
  DELETE = mod.DELETE
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting', game_type: 'codewords' })
  player = { id: PLAYER_ID }
  roleRow = { id: 'role-1', team: 'red' }
})

const post = (body: unknown) => POST(jsonRequest('/api/codewords/host-role', body))
const del = (body: unknown) => DELETE(jsonRequest('/api/codewords/host-role', body, 'DELETE'))

const validPost = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_CODE,
  hostToken: HOST_TOKEN,
  playerId: PLAYER_ID,
  team: 'red',
  role: 'operative',
  ...overrides,
})

const validDelete = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_CODE,
  hostToken: HOST_TOKEN,
  playerId: PLAYER_ID,
  ...overrides,
})

describe('POST /api/codewords/host-role — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE, playerId: PLAYER_ID, team: 'red', role: 'operative' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 + the zod issue message', async () => {
    const res = await post(validPost({ hostToken: '' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Too small: expected string to have >=1 characters' })
  })

  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await post(validPost({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await post(validPost())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await post(validPost({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-codewords game with 400 "Not a codewords game"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await post(validPost())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('rejects a finished codewords game with the teams-locked 400', async () => {
    game = gameRow({ status: 'finished', game_type: 'codewords' })
    const res = await post(validPost())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Teams can only be changed while the lobby or game is open',
    })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = gameRow({ status: 'finished', game_type: 'smash_marry_kill' })
    const res = await post(validPost())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('reports 403 before either 400 — a wrong token on a wrong-type, wrong-status game', async () => {
    game = gameRow({ status: 'finished', game_type: 'smash_marry_kill' })
    const res = await post(validPost({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('authorizes the real host on a waiting codewords game and assigns the role', async () => {
    const res = await post(validPost())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      role: { game_id: 'ABCD', player_id: PLAYER_ID, team: 'red' },
    })
  })
})

describe('DELETE /api/codewords/host-role — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await del({ gameId: GAME_CODE, playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 + the zod issue message', async () => {
    const res = await del(validDelete({ hostToken: '' }))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Too small: expected string to have >=1 characters' })
  })

  it('rejects a wrong hostToken with 403 "Unauthorized"', async () => {
    const res = await del(validDelete({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 "Game not found" when the game does not exist', async () => {
    game = null
    const res = await del(validDelete())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns 404 before 403 — a bad token on a missing game leaks nothing extra', async () => {
    game = null
    const res = await del(validDelete({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('rejects a non-codewords game with 400 "Not a codewords game"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill' })
    const res = await del(validDelete())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('rejects a finished codewords game with the players-locked 400', async () => {
    game = gameRow({ status: 'finished', game_type: 'codewords' })
    const res = await del(validDelete())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Players can only be moved while the lobby or game is open',
    })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = gameRow({ status: 'finished', game_type: 'smash_marry_kill' })
    const res = await del(validDelete())
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('reports 403 before either 400 — a wrong token on a wrong-type, wrong-status game', async () => {
    game = gameRow({ status: 'finished', game_type: 'smash_marry_kill' })
    const res = await del(validDelete({ hostToken: WRONG_TOKEN }))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('authorizes the real host on a waiting codewords game and benches the player', async () => {
    const res = await del(validDelete())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, ended: false })
  })
})
