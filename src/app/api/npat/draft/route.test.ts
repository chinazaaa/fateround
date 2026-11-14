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
let existingAnswer: Record<string, unknown> | null = null
const upsert = vi.fn()

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === 'games' ? GAME : table === 'rounds' ? ROUND : existingAnswer,
          error: null,
        }),
        upsert: async (row: unknown) => {
          upsert(row)
          return { error: null }
        },
      }
      return chain
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
    upsert.mockClear()
    existingAnswer = null
    player = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: '2025-12-31T00:00:00.000Z' }
  })

  it('saves a draft', async () => {
    expect((await send()).status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('rejects a viewer', async () => {
    player = { ...player, id: 'p-2', spectator: true }
    expect((await send()).status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('no-ops after submit', async () => {
    existingAnswer = { submitted_at: '2026-01-01T00:01:00.000Z' }
    expect((await send()).status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })
})
