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
 * Authorization contract for PATCH /api/tournaments/[code]/reschedule.
 *
 * Two gates flank the auth ladder: the zod schema BEFORE it (format) and "Pick a time in the
 * future." AFTER it. Both combinations with a rejected status are pinned, since that is
 * exactly the pairing where a swap can reorder gates invisibly to single-gate tests.
 */

vi.mock('server-only', () => ({}))

let tournament: Record<string, unknown> | null = tournamentRow({ status: 'scheduled' })

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => makeSupabaseStub({ tournaments: () => ({ data: tournament, error: null }) }),
}))
vi.mock('@/lib/tournament-push', () => ({ notifyTournamentEvent: vi.fn(async () => undefined) }))

type Patch = typeof import('./route').PATCH
let PATCH: Patch

/** Well past now, so the post-status "future" gate passes on the success path. */
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString()

beforeEach(async () => {
  tournament = tournamentRow({ status: 'scheduled' })
  ;({ PATCH } = await import('./route'))
})

async function reschedule(body: unknown) {
  const res = await PATCH(jsonRequest('/api/tournaments/abcd/reschedule', body, 'PATCH'), codeParams())
  return { status: res.status, body: await res.json() }
}

describe('PATCH /api/tournaments/[code]/reschedule host authorization', () => {
  it('rejects a body with no hostToken at the schema, before any lookup', async () => {
    const res = await reschedule({ scheduled_at: FUTURE })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid input: expected string, received undefined' })
  })

  it('rejects an empty hostToken at the schema', async () => {
    const res = await reschedule({ hostToken: '', scheduled_at: FUTURE })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Too small: expected string to have >=1 characters' })
  })

  it('404s when the tournament does not exist', async () => {
    tournament = null
    const res = await reschedule({ hostToken: HOST_TOKEN, scheduled_at: FUTURE })
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Tournament not found' })
  })

  it('403s on a wrong host token', async () => {
    const res = await reschedule({ hostToken: WRONG_TOKEN, scheduled_at: FUTURE })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('403s on a wrong token even when the tournament is already active', async () => {
    tournament = tournamentRow({ status: 'active' })
    const res = await reschedule({ hostToken: WRONG_TOKEN, scheduled_at: FUTURE })
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it.each(['active', 'finished'])('400s once the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await reschedule({ hostToken: HOST_TOKEN, scheduled_at: FUTURE })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Reschedule is only available before the tournament starts.' })
  })

  it('answers the FORMAT gate, not the status gate, when both would reject', async () => {
    // Schema rejection precedes the whole ladder, including the status rung.
    tournament = tournamentRow({ status: 'active' })
    const res = await reschedule({ hostToken: HOST_TOKEN, scheduled_at: 'not-a-timestamp' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid ISO datetime' })
  })

  it('answers the STATUS gate, not the past-time gate, when both would reject', async () => {
    // "Pick a time in the future." sits AFTER the ladder, so the status rung wins.
    tournament = tournamentRow({ status: 'active' })
    const res = await reschedule({ hostToken: HOST_TOKEN, scheduled_at: PAST })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Reschedule is only available before the tournament starts.' })
  })

  it('400s on a past time once authorization passes', async () => {
    const res = await reschedule({ hostToken: HOST_TOKEN, scheduled_at: PAST })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Pick a time in the future.' })
  })

  it.each(['waiting', 'scheduled'])('passes authorization when the tournament is %s', async (status) => {
    tournament = tournamentRow({ status })
    const res = await reschedule({ hostToken: HOST_TOKEN, scheduled_at: FUTURE })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
