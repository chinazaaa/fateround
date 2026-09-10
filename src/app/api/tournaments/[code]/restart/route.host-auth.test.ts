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
 * Authorization contract for POST /api/tournaments/[code]/restart.
 *
 * The only migrated route with NO status gate of its own: the state check lives inside the
 * `restart_tournament` RPC, which answers `not_finished` with a 409. Both the RPC's
 * rejection and its success are pinned so the swap can't quietly add a status gate.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'finished' })
let rpcResult: unknown = { data: { ok: true }, error: null }

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () =>
    makeSupabaseStub({ tournaments: () => ({ data: tournament, error: null }) }, { rpc: () => rpcResult }),
}))

type Post = typeof import('./route').POST
let POST: Post

beforeEach(async () => {
  tournament = tournamentRow({ status: 'finished' })
  rpcResult = { data: { ok: true }, error: null }
  ;({ POST } = await import('./route'))
})

async function restart(body: unknown) {
  const res = await POST(jsonRequest('/api/tournaments/abcd/restart', body), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('POST /api/tournaments/[code]/restart host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await restart({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await restart({ hostToken: '' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'hostToken is required' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await restart({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await restart({ hostToken: WRONG_TOKEN })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it.each(['waiting', 'active', 'scheduled', 'finished'])(
    'authorizes whatever the status is (%s) — the state check is the RPC’s',
    async (status) => {
      tournament = tournamentRow({ status })
      const res = await restart({ hostToken: HOST_TOKEN })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ success: true })
    }
  )

  it('passes the RPC’s not_finished rejection through as a 409', async () => {
    tournament = tournamentRow({ status: 'active' })
    rpcResult = { data: { error: 'not_finished' }, error: null }
    const res = await restart({ hostToken: HOST_TOKEN })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Only a finished tournament can be restarted' })
  })
})
