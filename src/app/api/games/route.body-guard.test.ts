import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/games used to call `await req.json()` bare, so an empty or malformed body threw as
 * an unhandled 500. The two gates that already ran before the body read — the rate-limit
 * backstop and the optional bearer-token attribution — must keep running first.
 *
 * The guard is shape-only on purpose: `createGameSchema` is a plain z.object, so handing the
 * body to it here would strip `elimination_config`, which the handler reads off the RAW body
 * further down.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => ({ from: fromSpy }) }))

const { enforceRateLimit, getProfileFromRequest } = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => null),
  getProfileFromRequest: vi.fn(async (): Promise<string | null> => null),
}))
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
  RATE_LIMITS: { gameCreate: { bucket: 'game-create', max: 40, windowSeconds: 300 } },
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  enforceRateLimit.mockClear()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/games — request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"title":'],
  ])('rejects %s with 400 "Invalid or empty request body" and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"game"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('leaves the rate-limit backstop in front of the body guard', async () => {
    await post('')
    expect(enforceRateLimit).toHaveBeenCalledTimes(1)
  })

  it('still lets createGameSchema own field validation on a well-formed body', async () => {
    const res = await post('{}')
    expect(res.status).toBe(400)
    // A createGameSchema issue message, not the guard's — proving the guard only checks shape.
    await expect(res.json()).resolves.not.toEqual({ error: 'Invalid or empty request body' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
