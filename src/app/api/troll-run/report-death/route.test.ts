import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

let state: Record<string, unknown> = {}
const session = { current_round: 1, level_order: ['l1', 'l2'] }
const eventInsert = vi.fn()
const eventDelete = vi.fn()
const stateUpdates: { patch: unknown; filters: [string, unknown][] }[] = []
/** What the guarded total update reports: rows matched. Empty = the runner finished first. */
let updateMatches: { id: string }[] = [{ id: 's-1' }]

function makeClient() {
  return {
    from: (table: string) => {
      const filters: [string, unknown][] = []
      let mode: 'select' | 'update' | 'delete' = 'select'
      let patch: unknown = null
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push([col, val])
          return chain
        },
        lt: (col: string, val: unknown) => {
          filters.push([`${col}<`, val])
          return chain
        },
        insert: (row: unknown) => {
          eventInsert(table, row)
          return { select: () => ({ single: async () => ({ data: { id: 'ev-1' }, error: null }) }) }
        },
        update: (p: unknown) => {
          mode = 'update'
          patch = p
          return chain
        },
        delete: () => {
          mode = 'delete'
          return chain
        },
        then: (resolve: (v: unknown) => void) => {
          if (mode === 'update') {
            stateUpdates.push({ patch, filters })
            return resolve({ data: updateMatches, error: null })
          }
          if (mode === 'delete') {
            eventDelete(table, filters)
            return resolve({ data: null, error: null })
          }
          return resolve({ data: null, count: 1, error: null })
        },
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

function send(levelId: string, round?: number) {
  return POST(
    new NextRequest('https://x.test/api/troll-run/report-death', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameId: 'ABCD',
        resumeToken: 'TOKEN-1234',
        levelId,
        ...(round === undefined ? {} : { round }),
      }),
    })
  )
}

describe('POST /api/troll-run/report-death', () => {
  beforeEach(() => {
    eventInsert.mockClear()
    eventDelete.mockClear()
    stateUpdates.length = 0
    updateMatches = [{ id: 's-1' }]
    state = { id: 's-1', player_id: 'p-1', deaths: 2, current_level_index: 0 }
  })

  it('records a death on a level in the round', async () => {
    const res = await send('l1')
    expect(res.status).toBe(200)
    expect(eventInsert).toHaveBeenCalledTimes(1)
    // The right row went into the death log: this player, this round, this level, a death.
    expect(eventInsert).toHaveBeenCalledWith(
      'troll_run_events',
      expect.objectContaining({
        game_id: 'ABCD',
        player_id: 'p-1',
        round: 1,
        level_id: 'l1',
        event_type: 'death',
      })
    )
  })

  it('writes the total only while the runner is unfinished', async () => {
    await send('l1')
    expect(stateUpdates).toHaveLength(1)
    expect(stateUpdates[0].filters).toContainEqual(['id', 's-1'])
    expect(stateUpdates[0].filters).toContainEqual(['current_level_index<', 2])
  })

  it('withdraws the death and ignores the report when the final clear landed first', async () => {
    updateMatches = []
    const res = await send('l1')
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, deaths: 2 })
    expect(eventDelete).toHaveBeenCalledWith('troll_run_events', [['id', 'ev-1']])
  })

  it('rejects a level that is not in the round', async () => {
    const res = await send('bogus-level-not-in-round')
    expect(res.status).toBe(400)
    expect(eventInsert).not.toHaveBeenCalled()
  })

  it('records a death stamped with the live round', async () => {
    const res = await send('l1', 1)
    expect(res.status).toBe(200)
    expect(eventInsert).toHaveBeenCalledTimes(1)
  })

  it('drops a death raised in an earlier round instead of counting it against this one', async () => {
    const res = await send('l1', 2)
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, stale: true })
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
