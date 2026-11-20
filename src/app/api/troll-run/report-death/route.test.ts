import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

let state: Record<string, unknown> = {}
const session = { current_round: 1, level_order: ['l1', 'l2'] }
const rpc = vi.fn()
/** What the SQL function reports; tests override per case. */
let rpcResult: { data: unknown; error: unknown } = { data: { status: 'ok', deaths: 3 }, error: null }

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    rpc: async (name: string, args: unknown) => {
      rpc(name, args)
      return rpcResult
    },
  }),
}))
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
    rpc.mockClear()
    rpcResult = { data: { status: 'ok', deaths: 3 }, error: null }
    state = { id: 's-1', player_id: 'p-1', deaths: 2, current_level_index: 0 }
  })

  it('records a death through the atomic database function', async () => {
    const res = await send('l1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, deaths: 3 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('troll_run_report_death', {
      p_game_id: 'ABCD',
      p_player_id: 'p-1',
      p_round: 1,
      p_level_id: 'l1',
      p_level_name: 'l1',
    })
  })

  it('acknowledges as ignored, without any cleanup write, when the database rejected the death', async () => {
    rpcResult = { data: { status: 'ignored', reason: 'finished', deaths: 2 }, error: null }
    const res = await send('l1')
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, deaths: 2 })
  })

  it('surfaces a database error as a retryable 500 instead of reporting ignored', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    const res = await send('l1')
    expect(res.status).toBe(500)
    expect(await res.json()).not.toHaveProperty('ignored')
  })

  it('does not report success for an unrecognised function result', async () => {
    rpcResult = { data: null, error: null }
    const res = await send('l1')
    expect(res.status).toBe(500)
  })

  it('rejects a level that is not in the round', async () => {
    const res = await send('bogus-level-not-in-round')
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('records a death stamped with the live round', async () => {
    const res = await send('l1', 1)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('drops a death raised in an earlier round instead of counting it against this one', async () => {
    const res = await send('l1', 2)
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, stale: true })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignores deaths after the player finished', async () => {
    state = { ...state, current_level_index: 2 }
    const res = await send('l2')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, ignored: true, deaths: 2 })
    expect(rpc).not.toHaveBeenCalled()
  })
})
