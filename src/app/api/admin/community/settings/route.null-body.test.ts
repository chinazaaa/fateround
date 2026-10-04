import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * POST /api/admin/community/settings parses its JSON body OUTSIDE any try/catch. A literal
 * `null` body parses successfully, so `.catch(() => ({}))` never fires and the first
 * property read (`body.whatsappInviteUrl`) throws out of the handler — the promise REJECTS
 * instead of answering a status.
 *
 * Both gates (admin auth, service-role key) are mocked open so every row exercises the parse.
 */

vi.mock('server-only', () => ({}))

const { assertAdminRequest, hasServiceRoleKey, getSupabaseAdmin, getSetting, setSetting } = vi.hoisted(() => ({
  assertAdminRequest: vi.fn(),
  hasServiceRoleKey: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}))

vi.mock('@/lib/admin-api', () => ({ assertAdminRequest }))
vi.mock('@/lib/supabase-admin', () => ({ hasServiceRoleKey, getSupabaseAdmin }))
// WHATSAPP_INVITE_URL_KEY keeps its real value so the setSetting assertion is faithful.
vi.mock('@/lib/community-data', () => ({
  getSetting,
  setSetting,
  WHATSAPP_INVITE_URL_KEY: 'whatsapp_invite_url',
}))

type Post = typeof import('./route').POST
let POST: Post

beforeAll(async () => {
  POST = (await import('./route')).POST
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  assertAdminRequest.mockResolvedValue({ email: 'admin@example.com', exp: Date.now() + 60_000 })
  hasServiceRoleKey.mockReturnValue(true)
  getSetting.mockResolvedValue(null)
  setSetting.mockResolvedValue(undefined)
})

function post(body: string) {
  return POST(
    new NextRequest('https://test.local/api/admin/community/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  )
}

function expectGatesPassed(status: number) {
  expect(assertAdminRequest).toHaveBeenCalledTimes(1)
  expect(hasServiceRoleKey).toHaveBeenCalledTimes(1)
  expect(status).not.toBe(401)
  expect(status).not.toBe(503)
}

describe('POST /api/admin/community/settings — JSON body matrix', () => {
  // Before the `?? {}` fix this REJECTED with
  // "TypeError: Cannot read properties of null (reading 'whatsappInviteUrl')" — an
  // unhandled rejection rather than a status. It now behaves exactly like `{}`.
  it('answers 200 and CLEARS the link for a literal null body', async () => {
    const res = await post('null')
    expectGatesPassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, whatsappInviteUrl: null })
    expect(setSetting).toHaveBeenCalledWith('whatsapp_invite_url', null)
  })

  it.each([
    ['an empty object', '{}'],
    ['a malformed body', '{"a":'],
    ['an empty body', ''],
    ['a number scalar', '5'],
    ['a string scalar', '"str"'],
    ['an array', '[]'],
    ['a valid body missing the whatsappInviteUrl field', '{"other":1}'],
  ])('answers 200 and CLEARS the link for %s', async (_label, body) => {
    const res = await post(body)
    expectGatesPassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, whatsappInviteUrl: null })
    expect(setSetting).toHaveBeenCalledWith('whatsapp_invite_url', null)
  })

  it('answers 200 and saves a valid URL', async () => {
    const res = await post('{"whatsappInviteUrl":"https://chat.whatsapp.com/abc"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      success: true,
      whatsappInviteUrl: 'https://chat.whatsapp.com/abc',
    })
    expect(setSetting).toHaveBeenCalledWith('whatsapp_invite_url', 'https://chat.whatsapp.com/abc')
  })

  it('answers 400 for a malformed URL', async () => {
    const res = await post('{"whatsappInviteUrl":"notaurl"}')
    expectGatesPassed(res.status)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Enter a valid URL (starting with https://)' })
    expect(setSetting).not.toHaveBeenCalled()
  })
})
