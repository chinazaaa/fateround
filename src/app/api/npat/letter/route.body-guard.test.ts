import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/npat/letter used to call `await req.json()` bare, so an empty or malformed body
 * threw as an unhandled 500. It must be a 400, decided before the game lookup.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/npat/letter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/npat/letter \u2014 request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"gameId":'],
  ])('rejects %s with 400 "Invalid or empty request body" and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"ABCD"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('still returns the pre-existing "Invalid input" 400 for a well-formed body with no fields', async () => {
    const res = await post('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
