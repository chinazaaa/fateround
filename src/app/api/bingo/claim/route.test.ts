import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const GAME = { id: 'ABCD', status: 'active', game_type: 'bingo', session_started_at: null }
const PLAYER = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: null }
// A full first row (index 0-4) is marked, so the claim is a valid line.
const CARD = {
  id: 'card-1',
  cells: Array.from({ length: 25 }, (_, i) => i + 1),
  marked_indices: [0, 1, 2, 3, 4],
}

let existingWinner: { id: string } | null = null
let rpcResult: { data: unknown; error: { message: string } | null } = {
  data: { status: 'won', claim: { id: 'claim-1' } },
  error: null,
}
const rpc = vi.fn()
const finish = vi.fn()

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'games') return { data: GAME, error: null }
          if (table === 'bingo_claims') return { data: existingWinner, error: null }
          if (table === 'bingo_cards') return { data: CARD, error: null }
          return { data: null, error: null }
        },
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
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: PLAYER }) }))
vi.mock('@/lib/game-finish', () => ({
  runFinishSideEffects: async (...args: unknown[]) => {
    finish(...args)
  },
}))

import { POST } from './route'

function send() {
  return POST(
    new NextRequest('https://x.test/api/bingo/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234' }),
    })
  )
}

describe('POST /api/bingo/claim', () => {
  beforeEach(() => {
    rpc.mockClear()
    finish.mockClear()
    existingWinner = null
    rpcResult = { data: { status: 'won', claim: { id: 'claim-1' } }, error: null }
  })

  it('approves a valid line and finishes the game in one database call, then runs the bookkeeping once', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    expect((await res.json()).claim).toEqual({ id: 'claim-1' })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0][0]).toBe('bingo_claim_win')
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('rejects a claim when someone already won', async () => {
    existingWinner = { id: 'claim-0' }
    const res = await send()
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('treats losing the unique-index race as "already won", not a 500, and does not run the bookkeeping', async () => {
    rpcResult = { data: { status: 'already_won' }, error: null }
    const res = await send()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Someone already won this round')
    expect(finish).not.toHaveBeenCalled()
  })

  it('rejects when the round finished between the read and the claim', async () => {
    rpcResult = { data: { status: 'game_not_active' }, error: null }
    const res = await send()
    expect(res.status).toBe(400)
    expect(finish).not.toHaveBeenCalled()
  })

  it('returns a 500 and runs no bookkeeping when the atomic write fails, leaving a retry possible', async () => {
    rpcResult = { data: null, error: { message: 'db down' } }
    const res = await send()
    expect(res.status).toBe(500)
    expect(finish).not.toHaveBeenCalled()
    // Nothing was committed (claim + finish are one transaction), so a retry is admitted.
    rpcResult = { data: { status: 'won', claim: { id: 'claim-1' } }, error: null }
    expect((await send()).status).toBe(200)
  })
})
