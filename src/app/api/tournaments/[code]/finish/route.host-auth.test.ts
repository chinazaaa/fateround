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
 * Authorization contract for POST /api/tournaments/[code]/finish.
 *
 * Pins the exact {status, body} of every auth branch — schema rejection, 404, 403, the
 * route's own "already finished" 400 — plus a success path past the triplet, so the swap
 * onto `assertTournamentHostUnfinished` is provably behaviour-preserving.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'active' })

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => makeSupabaseStub({ tournaments: () => ({ data: tournament, error: null }) }),
}))

type Post = typeof import('./route').POST
let POST: Post

beforeEach(async () => {
  tournament = tournamentRow({ status: 'active' })
  ;({ POST } = await import('./route'))
})

async function finish(body: unknown) {
  const res = await POST(jsonRequest('/api/tournaments/abcd/finish', body), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/finish host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await finish({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await finish({ hostToken: '' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'hostToken is required' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await finish({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await finish({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token even when the tournament is already finished (404/403 outrank the status gate)', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await finish({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('400s with the route-specific message on a finished tournament', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await finish({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Tournament already finished' })
  })

  it.each(['waiting', 'active', 'scheduled'])('passes authorization when the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await finish({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  it('never authorizes an empty token against a stored token', async () => {
    // Guards the one behavioural difference between `!==` and `secretMatches`: an empty
    // supplied token must not match. Reaches the ladder by passing the schema first.
    tournament = tournamentRow({ host_token: '' })
    const res = await finish({ hostToken: ' ' })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })
})

// No format/type gate on this route — the wrong-format + wrong-status combination is pinned
// on `games`, `reschedule`, `transfer-scheduled-host` and `[code]` PATCH, the migrated routes
// that actually have both.
