import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ result: {} as { error?: string; skipped?: boolean }, notified: 0 }))
vi.mock('@/lib/uno', () => ({ processUnoPlay: async () => state.result }))
vi.mock('@/lib/push', () => ({
  scheduleTurnNotification: () => {
    state.notified += 1
  },
}))
vi.mock('@/lib/game-admin', () => ({ assertPlayer: async () => ({ player: { id: 'A' } }) }))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { status: 'active', game_type: 'uno' } }) }),
      }),
    }),
  }),
}))

import { INTERNAL_ERROR_MESSAGE } from '@/lib/api-errors'
import { POST } from './route'

const call = () =>
  POST(
    new NextRequest('https://x.test/api/uno/play', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'abcd', resumeToken: 'ABCD1234', cardId: 'A1' }),
    })
  )

describe('POST /api/uno/play', () => {
  beforeEach(() => {
    state.notified = 0
  })

  it('answers a lost CAS with 409 and sends no turn notification', async () => {
    state.result = { skipped: true }
    const res = await call()
    expect(res.status).toBe(409)
    expect(state.notified).toBe(0)
  })

  it('answers a database failure with 500 and a validation error with 400', async () => {
    state.result = { error: INTERNAL_ERROR_MESSAGE }
    expect((await call()).status).toBe(500)
    state.result = { error: 'Not your turn' }
    expect((await call()).status).toBe(400)
    expect(state.notified).toBe(0)
  })

  it('a successful play notifies', async () => {
    state.result = {}
    const res = await call()
    expect(res.status).toBe(200)
    expect(state.notified).toBe(1)
  })
})
