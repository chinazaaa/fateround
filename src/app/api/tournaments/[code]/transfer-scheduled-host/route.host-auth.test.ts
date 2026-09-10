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
 * Authorization contract for POST /api/tournaments/[code]/transfer-scheduled-host.
 *
 * Same shape as `reschedule`: a zod format gate ahead of the ladder, a "before the
 * tournament starts" status rung inside it. The success path stops at the player lookup,
 * whose 404 body differs from the tournament 404 — that difference is what proves
 * authorization passed.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'scheduled' })

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () =>
    makeSupabaseStub({
      tournaments: () => ({ data: tournament, error: null }),
      tournament_players: () => ({ data: null, error: null }),
    }),
}))
vi.mock('@/lib/tournament-push', () => ({ notifyTournamentEvent: vi.fn(async () => undefined) }))

type Post = typeof import('./route').POST
let POST: Post

beforeEach(async () => {
  tournament = tournamentRow({ status: 'scheduled' })
  ;({ POST } = await import('./route'))
})

async function transfer(body: unknown) {
  const res = await POST(jsonRequest('/api/tournaments/abcd/transfer-scheduled-host', body), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/transfer-scheduled-host host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await transfer({ newHostPlayerId: PLAYER_ID })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await transfer({ hostToken: '', newHostPlayerId: PLAYER_ID })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Too small: expected string to have >=1 characters' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await transfer({ hostToken: HOST_TOKEN, newHostPlayerId: PLAYER_ID })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await transfer({ hostToken: WRONG_TOKEN, newHostPlayerId: PLAYER_ID })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token even when the tournament is already active', async () => {
    tournament = tournamentRow({ status: 'active' })
    const res = await transfer({ hostToken: WRONG_TOKEN, newHostPlayerId: PLAYER_ID })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it.each(['active', 'finished'])('400s once the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await transfer({ hostToken: HOST_TOKEN, newHostPlayerId: PLAYER_ID })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Transfer is only available before the tournament starts.' })
  })

  it('answers the FORMAT gate, not the status gate, when both would reject', async () => {
    tournament = tournamentRow({ status: 'active' })
    const res = await transfer({ hostToken: HOST_TOKEN, newHostPlayerId: 'not-a-uuid' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid UUID' })
  })

  it.each(['waiting', 'scheduled'])('passes authorization when the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await transfer({ hostToken: HOST_TOKEN, newHostPlayerId: PLAYER_ID })
    // Past the triplet: the player lookup answers now, with its own distinct 404 body.
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Player not registered in this tournament.' })
  })
})
