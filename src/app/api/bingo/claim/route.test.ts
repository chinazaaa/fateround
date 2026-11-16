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
let insertResult: { data: unknown; error: { code: string } | null } = { data: { id: 'claim-1' }, error: null }
const insert = vi.fn()
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
        insert: (row: unknown) => {
          insert(row)
          return { select: () => ({ single: async () => insertResult }) }
        },
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: PLAYER }) }))
vi.mock('@/lib/game-finish', () => ({
  markGameFinished: async (...args: unknown[]) => {
    finish(...args)
    return { error: null, won: true }
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
    insert.mockClear()
    finish.mockClear()
    existingWinner = null
    insertResult = { data: { id: 'claim-1' }, error: null }
  })

  it('approves a valid line and finishes the game', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('rejects a claim when someone already won', async () => {
    existingWinner = { id: 'claim-0' }
    const res = await send()
    expect(res.status).toBe(400)
    expect(insert).not.toHaveBeenCalled()
  })

  it('treats losing the unique-index race as "already won", not a 500, and does not finish the game', async () => {
    insertResult = { data: null, error: { code: '23505' } }
    const res = await send()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Someone already won this round')
    expect(finish).not.toHaveBeenCalled()
  })
})
