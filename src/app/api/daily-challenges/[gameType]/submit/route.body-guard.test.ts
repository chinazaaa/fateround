import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/daily-challenges/[gameType]/submit used to call `await req.json()` bare, so an
 * empty or malformed body threw as an unhandled 500. The body read sits AFTER the game-type
 * check and the 401 auth gate, and it must stay there: an unauthenticated caller with a junk
 * body still gets 401, not 400.
 */

vi.mock('server-only', () => ({}))

const { fromSpy } = vi.hoisted(() => ({
  fromSpy: vi.fn(() => {
    throw new Error('Supabase must not be touched on the malformed-body path')
  }),
}))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fromSpy }) }))

const { getProfileFromRequest } = vi.hoisted(() => ({
  getProfileFromRequest: vi.fn(async (): Promise<string | null> => 'profile-1'),
}))
vi.mock('@/lib/identity-server', () => ({ getProfileFromRequest }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
  getProfileFromRequest.mockResolvedValue('profile-1')
})

function post(body: string, gameType = 'wordle') {
  return POST(
    new NextRequest(`https://test.local/api/daily-challenges/${gameType}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    { params: Promise.resolve({ gameType }) }
  )
}

describe('POST /api/daily-challenges/[gameType]/submit — request body guard', () => {
  it.each([
    ['an empty body', ''],
    ['a malformed body', '{"challengeId":'],
  ])('rejects %s with 400 "Invalid or empty request body" and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a JSON string body', '"nope"'],
    ['a null body', 'null'],
  ])('rejects %s with 400 and no DB call', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: expect.stringContaining('expected record') })
    expect(fromSpy).not.toHaveBeenCalled()
  })

  it('keeps the 401 auth gate ahead of the body guard', async () => {
    getProfileFromRequest.mockResolvedValue(null)
    const res = await post('')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Authentication required' })
  })

  it('keeps the invalid-game-type 400 ahead of the body guard', async () => {
    const res = await post('', 'not-a-game')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid game type' })
  })

  it('still returns the pre-existing "Missing required fields" 400 for a well-formed empty object', async () => {
    const res = await post('{}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Missing required fields' })
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
