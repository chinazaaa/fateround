import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const GAME = { id: 'ABCD', status: 'active', game_type: 'two_truths' }
const PLAYER = { id: 'p-1', spectator: false, is_eliminated: false }
const ROUND = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  submitter_player_id: 'p-2',
  ttl_metadata: {},
}

let insertError: { code: string } | null = null

vi.mock('@/lib/two-truths', async (orig) => ({
  ...(await orig<typeof import('@/lib/two-truths')>()),
  parseTtlMetadata: () => ({ statements: ['a', 'b', 'c'] }),
}))

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'games') return { data: GAME, error: null }
          if (table === 'rounds') return { data: ROUND, error: null }
          if (table === 'ttl_round_lies') return { data: { lie_index: 1 }, error: null }
          return { data: null, error: null }
        },
        insert: async () => ({ error: insertError }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: PLAYER }) }))

import { POST } from './route'

function send() {
  return POST(
    new NextRequest('https://x.test/api/two-truths/guess', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', roundId: ROUND.id, guessedIndex: 1 }),
    })
  )
}

describe('POST /api/two-truths/guess', () => {
  beforeEach(() => {
    insertError = null
  })

  it('records a guess', async () => {
    expect((await send()).status).toBe(200)
  })

  it('returns 400 (not 500) when a concurrent duplicate loses the unique-index race', async () => {
    insertError = { code: '23505' }
    const res = await send()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Already guessed this round')
  })

  it('still maps an ended round to 409', async () => {
    insertError = { code: '23514' }
    expect((await send()).status).toBe(409)
  })

  it('still returns 500 for other insert errors', async () => {
    insertError = { code: 'XX000' }
    expect((await send()).status).toBe(500)
  })
})
