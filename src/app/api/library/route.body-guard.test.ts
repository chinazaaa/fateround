import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/library used to call `await req.json()` bare, so an empty or malformed body threw
 * as an unhandled 500. The rate-limit backstop deliberately still runs FIRST — the guard was
 * inserted after it, not in front of it — and the 400 is decided before any DB write.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => ({ from: fromSpy }) }))

const { enforceRateLimit } = vi.hoisted(() => ({ enforceRateLimit: vi.fn(async () => null) }))
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit,
  RATE_LIMITS: { librarySubmit: { bucket: 'library-submit', max: 20, windowSeconds: 3600 } },
}))

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
    new NextRequest('https://test.local/api/library', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/library — request body guard', () => {
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
    ['a JSON string body', '"pack"'],
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

  it('still returns the pre-existing "Missing required fields" 400 for a well-formed empty object', async () => {
    const res = await post('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
