import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const GAME = { id: 'ABCD', status: 'active', session_started_at: '2026-01-01T00:00:00.000Z' }
const ROUND = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  submitter_player_id: 'hot',
  game_id: 'ABCD',
}

let player: Record<string, unknown> = {}
const upsert = vi.fn()

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === 'games' ? GAME : ROUND, error: null }),
        upsert: (row: unknown) => {
          upsert(row)
          return { select: () => ({ single: async () => ({ data: { id: 's-1' }, error: null }) }) }
        },
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player }) }))

import { POST } from './route'

function send() {
  return POST(
    new NextRequest('https://x.test/api/hot-seat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameId: 'ABCD',
        roundId: ROUND.id,
        resumeToken: 'TOKEN-1234',
        text: 'a take',
        submissionType: 'roast',
      }),
    })
  )
}

describe('POST /api/hot-seat viewer guard', () => {
  beforeEach(() => upsert.mockClear())

  it('accepts a submission from a participant', async () => {
    player = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: '2025-12-31T00:00:00.000Z' }
    expect((await send()).status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('rejects a spectator', async () => {
    player = { id: 'p-2', spectator: true, is_eliminated: false, joined_at: '2025-12-31T00:00:00.000Z' }
    expect((await send()).status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('rejects a late joiner with no explicit spectator flag', async () => {
    player = { id: 'p-3', spectator: null, is_eliminated: false, joined_at: '2026-01-01T00:05:00.000Z' }
    expect((await send()).status).toBe(403)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('rejects an eliminated player', async () => {
    player = { id: 'p-4', spectator: false, is_eliminated: true, joined_at: '2025-12-31T00:00:00.000Z' }
    expect((await send()).status).toBe(403)
  })
})
