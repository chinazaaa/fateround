import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({
  finished: false,
  finishError: false,
  roundMismatch: false,
  afterStatus: 'active' as string,
  afterRound: 3 as number,
  reads: 0,
}))
vi.mock('@/lib/uno', () => ({
  finishExpiredUnoGame: async () =>
    state.finishError
      ? { won: false, error: 'x' }
      : state.roundMismatch
        ? { won: false, roundMismatch: true }
        : { won: state.finished },
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
                      sessions_played: 3,
                    },
                  }
                : { data: { status: state.afterStatus, sessions_played: state.afterRound, session_started_at: 'x' } }
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
    state.roundMismatch = false
    state.afterRound = 3
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

  it('a lost claim while the game is still running (a move won it) is a 409 conflict, not a 500', async () => {
    state.finished = false
    state.afterStatus = 'active'
    expect((await call()).status).toBe(409)
  })

  it('a round mismatch (a rematch started after the read) is a 409 before any status reread', async () => {
    state.roundMismatch = true
    state.afterStatus = 'finished'
    expect((await call()).status).toBe(409)
    expect(state.reads).toBe(1)
  })

  it('a lost claim whose reread shows a DIFFERENT finished round is a 409, not a success', async () => {
    state.finished = false
    state.afterStatus = 'finished'
    state.afterRound = 4
    expect((await call()).status).toBe(409)
  })

  it('a finish that errored is a 500 even if the game row already reads finished', async () => {
    state.finishError = true
    state.afterStatus = 'finished'
    expect((await call()).status).toBe(500)
  })
})
