import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ finished: false, finishError: false, afterStatus: 'active' as string, reads: 0 }))
vi.mock('@/lib/uno', () => ({
  finishExpiredUnoGame: async () => (state.finishError ? { won: false, error: 'x' } : { won: state.finished }),
  unoGameSessionExpired: () => true,
}))
vi.mock('@/lib/supabase-admin', () => {
  return {
    getSupabaseAdmin: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              state.reads += 1
              // First read: the active, expired game; later reads: its status after the failed finish.
              return state.reads % 2 === 1
                ? {
                    data: {
                      id: 'ABCD',
                      status: 'active',
                      game_type: 'uno',
                      session_started_at: 'x',
                      game_duration_seconds: 1,
                    },
                  }
                : { data: { status: state.afterStatus } }
            },
          }),
        }),
      }),
    }),
  }
})

import { POST } from './route'

const call = () =>
  POST(new NextRequest('https://x.test/api/games/ABCD/expire-uno', { method: 'POST' }), {
    params: Promise.resolve({ code: 'abcd' }),
  })

describe('POST /api/games/[code]/expire-uno', () => {
  beforeEach(() => {
    state.reads = 0
    state.finishError = false
  })

  it('a landed finish answers success', async () => {
    state.finished = true
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: true, finished: true })
  })

  it('a finish that lost to another finisher (game already finished) answers the same success', async () => {
    state.finished = false
    state.afterStatus = 'finished'
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: true, finished: true })
  })

  it('a real failed finish stays a 500', async () => {
    state.finished = false
    state.afterStatus = 'active'
    expect((await call()).status).toBe(500)
  })

  it('a finish that errored is a 500 even if the game row already reads finished', async () => {
    state.finishError = true
    state.afterStatus = 'finished'
    expect((await call()).status).toBe(500)
  })
})
