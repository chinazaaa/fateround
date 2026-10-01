import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/admin/community/code parses its JSON body OUTSIDE any try/catch. `req.json()`
 * parses a literal `null` body successfully, so the `.catch(() => ({}))` never fires and
 * `body` is `null` — the first property read (`body.code`) then throws a TypeError out of
 * the handler, so the returned promise REJECTS (an unhandled rejection) rather than
 * answering a status.
 *
 * This suite pins the whole body matrix. Both gates (admin auth, service-role key) are
 * mocked open so every row exercises the parse, not a 401/503.
 */

vi.mock('server-only', () => ({}))

const { assertAdminRequest, hasServiceRoleKey, getSupabaseAdmin, managerCodeIsSet, setManagerCode } = vi.hoisted(
  () => ({
    assertAdminRequest: vi.fn(),
    hasServiceRoleKey: vi.fn(),
    getSupabaseAdmin: vi.fn(),
    managerCodeIsSet: vi.fn(),
    setManagerCode: vi.fn(),
  })
)

vi.mock('@/lib/admin-api', () => ({ assertAdminRequest }))
vi.mock('@/lib/supabase-admin', () => ({ hasServiceRoleKey, getSupabaseAdmin }))
vi.mock('@/lib/manager-session', () => ({ managerCodeIsSet, setManagerCode }))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  // Faithful shapes: assertAdminRequest resolves the verifyAdminSessionToken payload
  // ({ email, exp }) or null; hasServiceRoleKey returns a boolean.
  assertAdminRequest.mockResolvedValue({ email: 'admin@example.com', exp: Date.now() + 60_000 })
  hasServiceRoleKey.mockReturnValue(true)
  managerCodeIsSet.mockResolvedValue(true)
  setManagerCode.mockResolvedValue(undefined)
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/admin/community/code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

/** Both gates must have been passed, or the matrix below would prove nothing. */
function expectGatesPassed(status: number) {
  expect(assertAdminRequest).toHaveBeenCalledTimes(1)
  expect(hasServiceRoleKey).toHaveBeenCalledTimes(1)
  expect(status).not.toBe(401)
  expect(status).not.toBe(503)
}

describe('POST /api/admin/community/code — JSON body matrix', () => {
  // Before the `?? {}` fix this REJECTED with
  // "TypeError: Cannot read properties of null (reading 'code')" — an unhandled
  // rejection rather than a status. It now behaves exactly like `{}`.
  it('answers 400 "Code must be at least 10 characters" for a literal null body', async () => {
    const res = await post('null')
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Code must be at least 10 characters' })
    expect(setManagerCode).not.toHaveBeenCalled()
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the code field', '{"other":1}'],
  ])('answers 400 "Code must be at least 10 characters" for %s', async (_label, body) => {
    const res = await post(body)
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Code must be at least 10 characters' })
    expect(setManagerCode).not.toHaveBeenCalled()
  })

  it('answers 200 for a valid body', async () => {
    const res = await post('{"code":"supersecret1"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, configured: true })
    expect(setManagerCode).toHaveBeenCalledWith('supersecret1')
  })
})
