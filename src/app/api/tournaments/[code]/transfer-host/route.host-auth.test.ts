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
 * Authorization contract for POST /api/tournaments/[code]/transfer-host.
 *
 * This route hand-parses its body, so a missing hostToken is its OWN 400 ("Missing
 * hostToken") that fires before the tournament is read — pinned here, including the fact
 * that no `tournaments` lookup happens on that path.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'active' })
let tournamentLookups = 0

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () =>
    makeSupabaseStub({
      tournaments: ({ op }) => {
        if (op === 'select') tournamentLookups += 1
        return { data: tournament, error: null }
      },
      tournament_players: () => ({ data: null, error: null }),
    }),
}))

type Post = typeof import('./route').POST
let POST: Post

beforeEach(async () => {
  tournament = tournamentRow({ status: 'active' })
  tournamentLookups = 0
  ;({ POST } = await import('./route'))
})

async function transfer(body: unknown) {
  const res = await POST(jsonRequest('/api/tournaments/abcd/transfer-host', body), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/transfer-host host authorization', () => {
  it('400s on an unparseable body', async () => {
    const res = await transfer('')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input' })
  })

  it('400s "Missing hostToken" without reading the tournament', async () => {
    const res = await transfer({ playerId: null })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
  })

  it('400s "Missing hostToken" on an empty hostToken, without reading the tournament', async () => {
    const res = await transfer({ hostToken: '' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
  })

  it('400s "Missing hostToken" on a non-string hostToken', async () => {
    // The hand-parse coerces a non-string to '', so this lands on the same rung.
    const res = await transfer({ hostToken: 123 })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
  })

  it('400s "Missing hostToken" even when the tournament does not exist', async () => {
    // The missing-token rung outranks the 404 — it is decided without touching the database.
    tournament = null
    const res = await transfer({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Missing hostToken' })
    expect(tournamentLookups).toBe(0)
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await transfer({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await transfer({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token even when the tournament is finished', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await transfer({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('400s with the route-specific message on a finished tournament', async () => {
    tournament = tournamentRow({ status: 'finished' })
    const res = await transfer({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "Can't transfer host of a finished tournament" })
  })

  it.each(['waiting', 'active', 'scheduled'])('passes authorization when the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    // A null playerId cancels a nomination, so this completes without a player lookup.
    const res = await transfer({ hostToken: HOST_TOKEN, playerId: null })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, pendingHostPlayerId: null })
  })
})
