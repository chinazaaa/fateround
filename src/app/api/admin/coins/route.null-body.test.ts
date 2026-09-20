import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/admin/coins parses its body inside a try/catch but reads properties OUTSIDE:
 *
 *   try { body = await req.json() } catch { return 400 'Invalid JSON.' }
 *   const profileId = typeof body.profileId === 'string' ? body.profileId.trim() : ''
 *
 * `req.json()` parses a literal `null` body SUCCESSFULLY, so the `catch` never fires and
 * `body` is `null`. The first property read then throws a TypeError from OUTSIDE the try
 * (and outside the later try/catch around the RPC), so the handler's returned promise
 * REJECTS (an unhandled rejection → 500 in prod) instead of answering a status.
 *
 * Unlike the unauthenticated routes, `assertAdminRequest` runs BEFORE the parse, so the
 * body matrix only reaches the parse with a valid admin session. Gate precedence is pinned
 * separately: a null body with no session must still answer 401, never crash.
 *
 * Every non-null scalar (5, "str", []) survives the read because property access on a
 * primitive boxes it and yields `undefined` — only `null` (and `undefined`) throw.
 *
 * This suite pins the exact status/body for every body shape so the `?? {}` fix can only
 * move the `null` row.
 */

vi.mock('server-only', () => ({}))

const { assertAdminRequest, rpc } = vi.hoisted(() => ({
  assertAdminRequest: vi.fn(),
  rpc: vi.fn(),
}))

// Real signature: (req: NextRequest) => Promise<AdminSession | null>, where the session
// carries an `email` the route lowercases for the RPC's p_admin_email.
vi.mock('@/lib/admin-api', () => ({ assertAdminRequest }))

// Faithful to the real call chain in the POST path:
//   getSupabaseAdmin().rpc('admin_adjust_coins', {...}) -> { data, error }
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ rpc }) }))

type Post = typeof import('./route').POST
let POST: Post

const PROFILE_ID = '11111111-2222-3333-4444-555555555555'
const VALID_BODY = JSON.stringify({
  profileId: PROFILE_ID,
  delta: 100,
  category: 'support_goodwill',
  note: 'goodwill for the dropped session',
})

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  assertAdminRequest.mockReset()
  assertAdminRequest.mockResolvedValue({ email: 'Admin@Example.com ' })
  rpc.mockReset()
  rpc.mockResolvedValue({
    data: { outcome: 'ok', new_balance: 1100, spent_today: 100, cap: 5000 },
    error: null,
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/admin/coins', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

describe('POST /api/admin/coins — null JSON body', () => {
  it('answers 400 "profileId is required." for a literal null body, exactly like {}', async () => {
    const res = await post('null')
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'profileId is required.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object body', '{}'],
    ['a numeric scalar body', '5'],
    ['a string scalar body', '"str"'],
    ['an array body', '[]'],
    ['a body missing the required profileId', '{"delta":100,"category":"promotion","note":"ten chars ok"}'],
  ])('answers 400 "profileId is required." for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'profileId is required.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['a malformed body', '{"profileId":'],
    ['an empty body', ''],
  ])('answers 400 "Invalid JSON." for %s', async (_label, body) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  // Gate precedence: the auth check runs BEFORE the body is read, so an unauthenticated
  // null body must answer 401 rather than crash on the property read.
  it('answers 401 for a null body with no admin session, before the body is read', async () => {
    assertAdminRequest.mockResolvedValue(null)
    const res = await post('null')
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 401 for a fully valid body with no admin session', async () => {
    assertAdminRequest.mockResolvedValue(null)
    const res = await post(VALID_BODY)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })

  // Past every gate, into the terminal success response.
  it('answers 200 with the RPC envelope for a fully valid body', async () => {
    const res = await post(VALID_BODY)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ balance: 1100, delta: 100, spentToday: 100, cap: 5000 })
    expect(rpc).toHaveBeenCalledWith('admin_adjust_coins', {
      p_profile_id: PROFILE_ID,
      p_delta: 100,
      p_admin_email: 'admin@example.com',
      p_category: 'support_goodwill',
      p_note: 'goodwill for the dropped session',
      p_daily_cap_coins: 5000,
    })
  })

  // Per-field validation, in route order — each one a "valid body missing a required field".
  it.each([
    [
      'a non-UUID profileId',
      '{"profileId":"abc","delta":100,"category":"promotion","note":"ten chars ok"}',
      'profileId must be a UUID.',
    ],
    [
      'a missing delta',
      `{"profileId":"${PROFILE_ID}","category":"promotion","note":"ten chars ok"}`,
      'Delta must be a non-zero integer.',
    ],
    ['a missing category', `{"profileId":"${PROFILE_ID}","delta":100,"note":"ten chars ok"}`, 'Unknown category.'],
    [
      'a missing note',
      `{"profileId":"${PROFILE_ID}","delta":100,"category":"promotion"}`,
      'Note must be at least 10 characters.',
    ],
    [
      'a negative delta outside the correction category',
      `{"profileId":"${PROFILE_ID}","delta":-100,"category":"promotion","note":"ten chars ok"}`,
      'Negative adjustments must use category "correction".',
    ],
  ])('answers 400 for %s', async (_label, body, error) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error })
    expect(rpc).not.toHaveBeenCalled()
  })
})
