import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
const state = vi.hoisted(() => ({ result: {} as { error?: string; skipped?: boolean; conflict?: boolean } }))
vi.mock('@/lib/uno', () => ({ processUnoExpireTurn: async () => state.result }))
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
    new NextRequest('https://x.test/api/uno/expire-turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: 'abcd' }),
    })
  )

describe('POST /api/uno/expire-turn', () => {
  it('answers a database failure with 500 and a validation error with 400', async () => {
    state.result = { error: INTERNAL_ERROR_MESSAGE }
    expect((await call()).status).toBe(500)
    state.result = { error: 'No current player' }
    expect((await call()).status).toBe(400)
  })

  it('answers a lost claim with 409 while a not-yet-due skip stays 200', async () => {
    state.result = { skipped: true, conflict: true }
    expect((await call()).status).toBe(409)
    state.result = { skipped: true }
    expect((await call()).status).toBe(200)
  })

  it('reports a skip as a 200 skipped body', async () => {
    state.result = { skipped: true }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: true })
  })
})
