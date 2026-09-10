import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  HOST_TOKEN,
  PLAYER_ID,
  WRONG_TOKEN,
  codeParams,
  jsonRequest,
  makeSupabaseStub,
  tournamentRow,
} from '@/test-support/tournament-host-auth'

/**
 * Authorization contract for POST /api/tournaments/[code]/remove-player.
 *
 * The success path stops at the player lookup — a 404 whose body ("Player not found")
 * differs from the tournament 404, which is what proves authorization was passed rather
 * than short-circuited.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'active' })

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () =>
    makeSupabaseStub({
      tournaments: () => ({ data: tournament, error: null }),
      // No such player: the first thing the route does after authorizing.
      tournament_players: () => ({ data: null, error: null }),
    }),
}))

// The live-room ejection helpers are only reached far past authorization, and importing them
// for real drags in the Scrabble dictionary — seconds of load for code these tests never run.
vi.mock('@/lib/whot', () => ({ removeWhotPlayer: vi.fn() }))
vi.mock('@/lib/scrabble', () => ({ removeScrabblePlayer: vi.fn() }))

type Post = typeof import('./route').POST
let POST: Post

beforeEach(async () => {
  tournament = tournamentRow({ status: 'active' })
  ;({ POST } = await import('./route'))
})

async function removePlayer(body: unknown) {
  const res = await POST(jsonRequest('/api/tournaments/abcd/remove-player', body), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/remove-player host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await removePlayer({ playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await removePlayer({ hostToken: '', playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'hostToken is required' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await removePlayer({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await removePlayer({ hostToken: WRONG_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token even when the tournament has ended', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await removePlayer({ hostToken: WRONG_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('400s with the route-specific message on a finished tournament', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await removePlayer({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Tournament has ended' })
  })

  it.each(['waiting', 'active', 'scheduled'])('passes authorization when the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await removePlayer({ hostToken: HOST_TOKEN, playerId: PLAYER_ID })
    // Past the triplet: the player lookup answers now, with its own distinct 404 body.
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Player not found' })
  })
})
