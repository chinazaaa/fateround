import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/codewords/expire-turn takes no token. While the turn had not expired it returned the
 * raw `codewords_boards` row, including the secret `key`, to anyone who knew the game code.
 */

vi.mock('server-only', () => ({}))

const KEY = ['red', 'blue', 'neutral', 'assassin', 'red', 'blue']
const BOARD = {
  id: 'board-1',
  game_id: 'ABCD',
  words: ['a', 'b', 'c', 'd', 'e', 'f'],
  key: KEY,
  revealed_indices: [1],
  winner: null,
  turn_phase: 'clue',
  // Far in the future, so the turn has not expired and the route takes its "skipped" branch.
  turn_deadline_at: '2999-01-01T00:00:00.000Z',
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: table === 'games' ? { game_type: 'codewords', status: 'active' } : BOARD,
          error: null,
        }),
      }
      return chain
    },
  }),
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => vi.clearAllMocks())

describe('POST /api/codewords/expire-turn board response', () => {
  it('does not return the unrevealed key to an unauthenticated caller', async () => {
    const res = await POST(
      new NextRequest('https://test.local/api/codewords/expire-turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId: 'ABCD' }),
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.board.key).toEqual([null, 'blue', null, null, null, null])
    // Only revealed cells keep their value; the split counts are not secret and are sent separately.
    expect(body.board.key).not.toContain('assassin')
    expect(body.board.key_totals).toEqual({ red: 2, blue: 2, neutral: 1, assassin: 1 })
  })
})
