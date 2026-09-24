import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/anonymous-messages/trim parses its body OUTSIDE any try/catch:
 *
 *   const raw = await req.json().catch(() => ({}))
 *   const gameId = String(raw.gameId ?? '').toUpperCase()
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `.catch` never fires and
 * `raw` is `null`. Reading `raw.gameId` then throws a TypeError, and because the parse sits
 * outside any try the handler's returned promise REJECTS (an unhandled rejection in prod)
 * instead of answering a status.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { maybeSingle, trimAnonymousMessagesIfDue } = vi.hoisted(() => ({
  maybeSingle: vi.fn(async () => ({ data: null as { status: string; game_type: string } | null, error: null })),
  trimAnonymousMessagesIfDue: vi.fn(async () => ({ trimmed: 0 })),
}))

// Faithful to the real call chain in the route:
//   supabase.from('games').select('status, game_type').eq('id', gameId).maybeSingle()
// which resolves to `{ data, error }` (supabase-js PostgrestMaybeSingleResponse).
vi.mock('@/lib/supabase-anon', () => ({
  getSupabaseAnon: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  }),
}))

// Real signature: (supabase, gameId) => Promise<{ trimmed: number }>
vi.mock('@/lib/anonymous-messages', () => ({ trimAnonymousMessagesIfDue }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  maybeSingle.mockReset()
  maybeSingle.mockResolvedValue({ data: null, error: null })
  trimAnonymousMessagesIfDue.mockReset()
  trimAnonymousMessagesIfDue.mockResolvedValue({ trimmed: 0 })
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/anonymous-messages/trim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/anonymous-messages/trim — null JSON body', () => {
  it('answers 400 "gameId is required" for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'gameId is required' })
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a valid body missing gameId', '{"foo":"bar"}'],
  ])('answers 400 "gameId is required" for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'gameId is required' })
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('answers 404 for a valid body whose game does not exist', async () => {
    const res = await post('{"gameId":"abcd"}')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('answers 200 with the trimmed count for a valid body on an active message board', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'active', game_type: 'anonymous_messages' }, error: null })
    trimAnonymousMessagesIfDue.mockResolvedValue({ trimmed: 7 })
    const res = await post('{"gameId":"abcd"}')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ trimmed: 7 })
    expect(trimAnonymousMessagesIfDue).toHaveBeenCalledTimes(1)
  })

  it('answers 400 "Not a message board" for a valid body on a non-inbox game', async () => {
    maybeSingle.mockResolvedValue({ data: { status: 'active', game_type: 'smash_or_pass' }, error: null })
    const res = await post('{"gameId":"abcd"}')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Not a message board' })
    expect(trimAnonymousMessagesIfDue).not.toHaveBeenCalled()
  })
})
