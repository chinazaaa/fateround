import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

const GAME = { id: 'ABCD', status: 'active', session_started_at: new Date().toISOString(), game_duration_seconds: null }
const ROUND = { id: 'r-1', word_scramble_metadata: { count: 3, scrambles: [] } }

let insertError: { code?: string; message: string } | null = null
let solves: { scramble_index: number }[] = []

function makeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === 'games' ? GAME : table === 'rounds' ? ROUND : { solution: ['apple', 'bread', 'crane'] },
          error: null,
        }),
        insert: async () => ({ error: insertError }),
        then: (resolve: (v: unknown) => void) => resolve({ data: solves, error: null }),
      }
      return chain
    },
  }
}

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => makeClient() }))
vi.mock('@/lib/game-admin', () => ({
  assertPlayer: async () => ({ error: null, status: 200, player: { id: 'p-1', spectator: false } }),
}))
vi.mock('@/lib/word-scramble-finish', () => ({ finishExpiredWordScrambleGame: vi.fn() }))
vi.mock('@/lib/game-finish', () => ({ markGameFinished: vi.fn(async () => ({ error: null })) }))

import { POST } from './route'

function send() {
  return POST(
    new NextRequest('https://x.test/api/word-scramble/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'ABCD', resumeToken: 'TOKEN-1234', scrambleIndex: 0, guess: 'apple' }),
    })
  )
}

describe('POST /api/word-scramble/submit', () => {
  beforeEach(() => {
    insertError = null
    solves = []
  })

  it('records a correct solve', async () => {
    const res = await send()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ correct: true, word: 'apple' })
  })

  it('answers a sequential duplicate as alreadySolved', async () => {
    solves = [{ scramble_index: 0 }]
    expect(await (await send()).json()).toEqual({ correct: true, word: 'apple', alreadySolved: true })
  })

  it('treats a unique-index race (23505) like a sequential duplicate, not a 500', async () => {
    insertError = { code: '23505', message: 'duplicate key' }
    const res = await send()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ correct: true, word: 'apple', alreadySolved: true })
  })

  it('still returns 500 for other insert errors', async () => {
    insertError = { code: '08006', message: 'boom' }
    expect((await send()).status).toBe(500)
  })
})
