import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonRequest } from '@/test-support/host-auth'

/**
 * Request-body guard for POST /api/mahjong/claim.
 *
 * `await req.json()` throws on an empty or malformed body, which used to escape the
 * handler as an unhandled 500. The route now reads the body through `parseJsonBody`
 * (the PR #1153 pattern), so those cases return 400 "Invalid or empty request body".
 *
 * The guard runs BEFORE the first Supabase read, so a bad body never reaches the
 * authorization ladder — the same ordering the un-guarded route had, where the throw
 * also happened before any query. Everything past the parse stays pinned by the
 * existing characterization tests, which this file leaves untouched.
 */

vi.mock('server-only', () => ({}))

const fromSpy = vi.fn(() => {
  throw new Error('the body guard must return before any Supabase access')
})
const supabase = { from: fromSpy, rpc: fromSpy }

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => supabase }))

type Post = typeof import('./route').POST
let POST: Post

// The route modules pull in large dependency graphs; the one-time import gets its own
// generous budget so it doesn't trip the default hook timeout under a full-suite run.
beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  fromSpy.mockClear()
})

// `jsonRequest` sends a string body verbatim, which is how the empty and malformed
// cases are expressed.
const post = (body: string) => POST(jsonRequest('/api/mahjong/claim', body))

describe('POST /api/mahjong/claim — request body guard', () => {
  it('rejects an empty request body with 400 "Invalid or empty request body"', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('rejects a malformed JSON body with 400 "Invalid or empty request body"', async () => {
    const res = await post('{"hostToken":')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('rejects a non-JSON body with 400 "Invalid or empty request body"', async () => {
    const res = await post('not json at all')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or empty request body' })
  })

  it('returns the body 400 without touching Supabase — the guard precedes host auth', async () => {
    const res = await post('')
    expect(res.status).toBe(400)
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
