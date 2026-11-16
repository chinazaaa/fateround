import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

let state: Record<string, unknown> = {}
const session = { current_round: 1, level_order: ['l1', 'l2'] }
const eventInsert = vi.fn()

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        insert: async (row: unknown) => {
          eventInsert(table, row)
          return { error: null }
        },
        update: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: null, count: 1, error: null }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/troll-run-guard', () => ({
  assertTrollRunRacingPlayer: async () => ({ ok: true, session, state }),
}))

import { POST } from './route'

function send(levelId: string) {
  return POST(
    new NextRequest('https://x.test/api/troll-run/report-death', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', levelId }),
    })
  )
}

describe('POST /api/troll-run/report-death', () => {
  beforeEach(() => {
    eventInsert.mockClear()
    state = { id: 's-1', player_id: 'p-1', deaths: 2, current_level_index: 0 }
  })

  it('records a death on a level in the round', async () => {
    const res = await send('l1')
    expect(res.status).toBe(200)
    expect(eventInsert).toHaveBeenCalledTimes(1)
  })

  it('rejects a level that is not in the round', async () => {
    const res = await send('bogus-level-not-in-round')
    expect(res.status).toBe(400)
    expect(eventInsert).not.toHaveBeenCalled()
  })

  it('ignores deaths after the player finished', async () => {
    state = { ...state, current_level_index: 2 }
    const res = await send('l2')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, deaths: 2 })
    expect(eventInsert).not.toHaveBeenCalled()
  })
})
