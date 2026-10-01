import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST and DELETE /api/wst-quotes both used to call `await req.json()` bare (DELETE even
 * destructured straight off the promise), so an empty or malformed body threw as an unhandled
 * 500. Both must be a 400 decided before any auth lookup.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

type Post = typeof import('./route').POST
type Delete = typeof import('./route').DELETE
let POST: Post
let DELETE: Delete

beforeAll(async () => {
  ;({ POST, DELETE } = await import('./route'))
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
})

function request(body: string, method: string) {
  return new NextRequest('https://test.local/api/wst-quotes', {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
}

describe.each([
  ['POST', () => POST],
  ['DELETE', () => DELETE],
])('%s /api/wst-quotes \u2014 request body guard', (method, handler) => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"gameId":'],
  ])('rejects %s with 400 "Invalid or empty request body" and no DB call', async (_label, body) => {
    const res = await handler()(request(body, method))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"ABCD"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and no DB call', async (_label, body) => {
    const res = await handler()(request(body, method))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('still returns the pre-existing "Missing required fields" 400 for a well-formed empty object', async () => {
    const res = await handler()(request('{}', method))
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
