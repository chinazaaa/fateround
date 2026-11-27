import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ result: { finished: true } as { finished: boolean; error?: string } }))
vi.mock('@/lib/scrabble', () => ({
  finishExpiredScrabbleGame: async () => state.result,
  scrabbleGameSessionExpired: () => true,
}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'ABCD',
              status: 'active',
              game_type: 'scrabble',
              session_started_at: 'x',
              game_duration_seconds: 1,
            },
          }),
        }),
      }),
    }),
  }),
}))

import { POST } from './route'

const call = () =>
  POST(new NextRequest('https://x.test/api/games/ABCD/expire-scrabble', { method: 'POST' }), {
    params: Promise.resolve({ code: 'abcd' }),
  })

describe('POST /api/games/[code]/expire-scrabble', () => {
  it('a finished round answers expired + finished', async () => {
    state.result = { finished: true }
    expect(await (await call()).json()).toEqual({ expired: true, finished: true })
  })

  it('a claim lost to a running round answers finished: false (not an error)', async () => {
    state.result = { finished: false }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: true, finished: false })
  })

  it('a real failure is a 500', async () => {
    state.result = { finished: false, error: 'x' }
    expect((await call()).status).toBe(500)
  })
})
