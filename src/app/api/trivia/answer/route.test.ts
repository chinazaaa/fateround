import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const GAME = { id: 'ABCD', status: 'active', game_type: 'trivia', timer_seconds: 10, session_started_at: null }
const PLAYER = { id: 'p-1', spectator: false, is_eliminated: false, joined_at: null }
const ROUND = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  started_at: '2026-01-01T00:00:00.000Z',
  trivia_metadata: { question: 'Q?', choices: ['a', 'b', 'c', 'd'], correct_index: 1, category: 'general' },
}

let insertError: { code: string } | null = null
const insert = vi.fn()

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'games') return { data: GAME, error: null }
          if (table === 'rounds') return { data: ROUND, error: null }
          return { data: null, error: null }
        },
        insert: (row: unknown) => {
          insert(row)
          return {
            select: () => ({
              single: async () =>
                insertError ? { data: null, error: insertError } : { data: { id: 'a-1' }, error: null },
            }),
          }
        },
        then: (resolve: (v: unknown) => void) => resolve({ count: 0, error: null }),
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
    new NextRequest('https://x.test/api/trivia/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', roundId: ROUND.id, choiceIndex: 1 }),
    })
  )
}

describe('POST /api/trivia/answer', () => {
  beforeEach(() => {
    insert.mockClear()
    insertError = null
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('accepts an answer inside the timer', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    const res = await send()
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('accepts an answer inside the latency grace just after the timer', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:11.000Z'))
    expect((await send()).status).toBe(200)
  })

  it('rejects an answer after the timer even though the round is still active', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:30.000Z'))
    const res = await send()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Time is up for this question')
    expect(insert).not.toHaveBeenCalled()
  })

  it('reports a racing duplicate (unique violation) as 400, not 500', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    insertError = { code: '23505' }
    const res = await send()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Already answered this round')
  })
})
