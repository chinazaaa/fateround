import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const ROUND_ID = '11111111-1111-4111-8111-111111111111'
const GAME = { id: 'ABCD', status: 'active', game_type: 'i_call_on', session_started_at: '2026-01-01T00:00:00.000Z' }
const ROUND = {
  id: ROUND_ID,
  status: 'active',
  npat_metadata: { phase: 'writing', letter: 'B', reviewer_assignments: {} },
}

let player: Record<string, unknown> = {}
let rpcResult: { data: unknown; error: { message: string } | null } = { data: { status: 'saved' }, error: null }
const rpc = vi.fn()

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === 'games' ? GAME : table === 'rounds' ? ROUND : null,
          error: null,
        }),
      }
      return chain
    },
    rpc: async (fn: string, args: unknown) => {
      rpc(fn, args)
      return rpcResult
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ error: null, status: 200, player }) }))

import { POST } from './route'

function send() {
  return POST(
    new NextRequest('https://x.test/api/npat/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameId: 'ABCD',
        resumeToken: 'TOKEN-1234',
        roundId: ROUND_ID,
        name: 'Bob',
        animal: 'Bear',
        place: 'Berlin',
        thing: 'Book',
        food: 'Bread',
      }),
    })
  )
}

describe('POST /api/npat/draft', () => {
  beforeEach(() => {
    rpc.mockClear()
    rpcResult = { data: { status: 'saved' }, error: null }
    player = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: '2025-12-31T00:00:00.000Z' }
  })

  it('saves a draft (not a submission) through the guarded database function', async () => {
    expect((await send()).status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('npat_save_answer')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_player_id: 'p-1', p_submit: false })
  })

  it('rejects a viewer', async () => {
    player = { ...player, id: 'p-2', spectator: true }
    expect((await send()).status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('draft arriving after a submit committed (OD-1): leaves the submitted row alone and reports success', async () => {
    rpcResult = { data: { status: 'already_submitted' }, error: null }
    const res = await send()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('fails with a 500 when the write errors', async () => {
    rpcResult = { data: null, error: { message: 'write failed' } }
    expect((await send()).status).toBe(500)
  })
})
