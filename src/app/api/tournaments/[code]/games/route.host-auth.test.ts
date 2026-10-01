import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOST_TOKEN,
  WRONG_TOKEN,
  codeParams,
  jsonRequest,
  makeSupabaseStub,
  tournamentRow,
} from '@/test-support/tournament-host-auth'

/**
 * Authorization contract for POST /api/tournaments/[code]/games.
 *
 * This route has BOTH a status gate ("Tournament has ended") and a game-type gate
 * ("… is not eligible for tournaments"), and the status gate runs first. The combination —
 * an ineligible game type on a finished tournament — is pinned explicitly: that exact
 * pairing is where a swap can silently reorder two gates while every single-gate test still
 * passes.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'waiting' })

function stub() {
  return makeSupabaseStub({
    tournaments: () => ({ data: tournament, error: null }),
    // No game in progress and nothing spawned yet, so the route walks straight from
    // authorization to its game-type gate.
    tournament_games: () => ({ data: null, count: 0, error: null }),
  })
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => stub() }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => stub() }))

type Post = typeof import('./route').POST
let POST: Post

beforeEach(async () => {
  tournament = tournamentRow({ status: 'waiting' })
  ;({ POST } = await import('./route'))
})

async function addGame(body: unknown) {
  const res = await POST(jsonRequest('/api/tournaments/abcd/games', body), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/games host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await addGame({ gameType: 'trivia' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await addGame({ hostToken: '', gameType: 'trivia' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'hostToken is required' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await addGame({ hostToken: HOST_TOKEN, gameType: 'trivia' })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await addGame({ hostToken: WRONG_TOKEN, gameType: 'trivia' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token even when the tournament has ended', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await addGame({ hostToken: WRONG_TOKEN, gameType: 'trivia' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('400s with the route-specific message on a finished tournament', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await addGame({ hostToken: HOST_TOKEN, gameType: 'trivia' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Tournament has ended' })
  })

  it('400s on an ineligible game type once authorization passes', async () => {
    const res = await addGame({ hostToken: HOST_TOKEN, gameType: 'chess' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Game type "chess" is not eligible for tournaments' })
  })

  it('answers the STATUS gate, not the game-type gate, when both would reject', async () => {
    // The precedence-pinning case: an ineligible game type AND a finished tournament.
    tournament = tournamentRow({ status: 'finished' })
    const res = await addGame({ hostToken: HOST_TOKEN, gameType: 'chess' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Tournament has ended' })
  })

  it.each(['waiting', 'active', 'scheduled'])('passes authorization when the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await addGame({ hostToken: HOST_TOKEN, gameType: 'chess' })
    // Past the triplet: the answer is now the game-type gate's, not an auth branch's.
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Game type "chess" is not eligible for tournaments' })
  })
})
