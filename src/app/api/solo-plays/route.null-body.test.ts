import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/solo-plays parses its body inside a try/catch but reads properties OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid JSON' }
 *   const gameType = typeof body.gameType === 'string' ? body.gameType : ''
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. The first property read then throws a TypeError from OUTSIDE the try,
 * so the handler's returned promise REJECTS (an unhandled rejection → 500 in prod) instead
 * of answering a status. There is no gate before the parse: this route is reachable
 * unauthenticated.
 *
 * Every non-null scalar (5, "str", []) survives the read because property access on a
 * primitive boxes it and yields `undefined` — only `null` (and `undefined`) throw.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }))

// Faithful to the real call chain in the route:
//   getSupabaseAdmin().from('solo_plays').insert({ game_type, difficulty }) -> { error }
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => ({ insert: (row: unknown) => insert(table, row) }) }),
}))

// `@/lib/solo-play` (hasSoloPlay) is deliberately NOT mocked — it is a pure registry
// lookup and is load-bearing for which gameType values are accepted.

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  insert.mockReset()
  insert.mockResolvedValue({ error: null })
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/solo-plays', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/solo-plays — null JSON body', () => {
  it('answers 400 "Unsupported game type" for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Unsupported game type' })
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a body missing the required gameType', '{"difficulty":"easy"}'],
    ['a body with a non-solo gameType', '{"gameType":"smash_marry_kill"}'],
    ['a body with a non-string gameType', '{"gameType":7}'],
  ])('answers 400 "Unsupported game type" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Unsupported game type' })
    expect(insert).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"gameType":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid JSON" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON' })
    expect(insert).not.toHaveBeenCalled()
  })

  // Past the gates, into the terminal success response.
  it('answers 200 and inserts for a fully valid body', async () => {
    const res = await post('{"gameType":"whot","difficulty":"easy"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith('solo_plays', { game_type: 'whot', difficulty: 'easy' })
  })

  it('answers 200 and inserts a null difficulty when the optional field is absent', async () => {
    const res = await post('{"gameType":"whot"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(insert).toHaveBeenCalledWith('solo_plays', { game_type: 'whot', difficulty: null })
  })

  it('answers 500 when the insert fails', async () => {
    insert.mockResolvedValue({ error: { message: 'boom' } })
    const res = await post('{"gameType":"whot"}')
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to record solo play' })
  })
})
