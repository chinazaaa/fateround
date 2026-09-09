import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAME_CODE, HOST_TOKEN, WRONG_TOKEN, gameRow, jsonRequest, makeSupabaseStub } from '@/test-support/host-auth'

/**
 * Characterization of the host-authorization branch of POST /api/codewords/randomize-teams.
 *
 * Ladder: 404 → 403 → game-TYPE 400 → status 400 → "not a randomized-teams game" 400.
 * Two 400s follow the type gate, so the combined wrong-type + wrong-status case pins
 * that the TYPE error is the one a caller sees.
 */

vi.mock('server-only', () => ({}))

const ROLES = [
  { player_id: 'p1', team: 'red', role: 'spymaster' },
  { player_id: 'p2', team: 'blue', role: 'spymaster' },
  { player_id: 'p3', team: 'red', role: 'operative' },
  { player_id: 'p4', team: 'blue', role: 'operative' },
]

let game: Record<string, unknown> | null = gameRow({
  status: 'waiting',
  game_type: 'codewords',
  codewords_randomize_teams: true,
})

const supabase = makeSupabaseStub({
  games: () => ({ data: game, error: null }),
  players: () => ({ data: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }], error: null }),
  codewords_player_roles: () => ({ data: ROLES, error: null }),
})

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  game = gameRow({ status: 'waiting', game_type: 'codewords', codewords_randomize_teams: true })
})

const post = (body: unknown) => POST(jsonRequest('/api/codewords/randomize-teams', body))

describe('POST /api/codewords/randomize-teams — host authorization', () => {
  it('rejects an absent hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken with 400 + the zod issue message', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: '' })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Too small: expected string to have >=1 characters' })
  })

  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
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

  it('rejects a non-codewords game with 400 "Not a codewords game"', async () => {
    game = gameRow({ status: 'waiting', game_type: 'smash_marry_kill', codewords_randomize_teams: true })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('rejects a started codewords game with the lobby-only 400', async () => {
    game = gameRow({ status: 'active', game_type: 'codewords', codewords_randomize_teams: true })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Teams can only be shuffled in the lobby' })
  })

  it('reports the TYPE error before the STATUS error when both are wrong', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill', codewords_randomize_teams: true })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a codewords game' })
  })

  it('reports 403 before either 400 — a wrong token on a wrong-type, wrong-status game', async () => {
    game = gameRow({ status: 'active', game_type: 'smash_marry_kill', codewords_randomize_teams: true })
    const res = await post({ gameId: GAME_CODE, hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('rejects a codewords game that does not use randomized teams', async () => {
    game = gameRow({ status: 'waiting', game_type: 'codewords', codewords_randomize_teams: false })
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'This game does not use randomized teams' })
  })

  it('authorizes the real host on a waiting randomized-teams game', async () => {
    const res = await post({ gameId: GAME_CODE, hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, roles: ROLES, alreadyShuffled: true })
  })
})
