import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/rooms used to call `await req.json()` bare, so an empty or malformed body threw as
 * an unhandled 500. It must be a 400, decided before the room-code lookup.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))
vi.mock('@/lib/supabase-anon', () => ({ getSupabaseAnon: () => ({ from: fromSpy }) }))

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
    new NextRequest('https://test.local/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/rooms \u2014 request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"name":'],
  ])('rejects %s with 400 "Invalid or empty request body" and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"lounge"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('still returns the pre-existing "Room name is required" 400 for a well-formed empty object', async () => {
    const res = await post('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Room name is required' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
