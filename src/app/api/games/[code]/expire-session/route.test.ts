import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The response must describe the room as it is when it is sent: a stale expiry request whose session-bound finish lost
 * (the expired session was finished and the room reopened) must not claim `finished: true`.
 */
vi.mock('server-only', () => ({}))

const outcome = vi.hoisted(() => ({ value: 'finished' as 'finished' | 'superseded' | 'error' }))
vi.mock('@/lib/anonymous-messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/anonymous-messages')>()),
  anonymousSessionExpired: () => true,
  finishExpiredAnonymousSession: async () => outcome.value,
}))
const admin = {
  from: () => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({
        data: { id: 'ABCD', status: 'active', game_type: 'anonymous_messages', session_started_at: '2020-01-01' },
        error: null,
      }),
    }
    return api
  },
}
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => admin }))

let POST: typeof import('./route').POST
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)
beforeEach(() => {
  outcome.value = 'finished'
})

const expire = () =>
  POST(new NextRequest('https://x.test/api/games/abcd/expire-session', { method: 'POST' }), {
    params: Promise.resolve({ code: 'abcd' }),
  })

describe('POST /api/games/[code]/expire-session', () => {
  it('reports the room finished when this request (or the current state) finished it', async () => {
    const res = await expire()
    expect(await res.json()).toEqual({ expired: true, finished: true })
  })

  it('a lost session-bound finish (the room was reopened) is NOT reported as finished', async () => {
    outcome.value = 'superseded'
    const res = await expire()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ expired: false, finished: false })
  })

  it('a failed finish answers 500', async () => {
    outcome.value = 'error'
    expect((await expire()).status).toBe(500)
  })
})
