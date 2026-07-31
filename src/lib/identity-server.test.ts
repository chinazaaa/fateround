import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  hasKey: true,
  // Left untyped so each test can resolve a different user/error shape without fighting a
  // signature inferred from whichever value happened to be first.
  getUser: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  hasServiceRoleKey: () => h.hasKey,
  getSupabaseAdmin: () => ({ auth: { getUser: h.getUser } }),
}))

import { getProfileFromRequest, isPermanentAccount } from './identity-server'

/** Minimal stand-in — only the header bag is ever touched. */
function req(headers: Record<string, string> = {}): NextRequest {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return { headers: { get: (k: string) => lower[k.toLowerCase()] ?? null } } as unknown as NextRequest
}

beforeEach(() => {
  h.hasKey = true
  h.getUser.mockReset()
  h.getUser.mockResolvedValue({ data: { user: { id: 'p-1', is_anonymous: true } }, error: null })
})

describe('getProfileFromRequest', () => {
  it('returns the profile id for a valid bearer token', async () => {
    expect(await getProfileFromRequest(req({ Authorization: 'Bearer good.jwt' }))).toBe('p-1')
    expect(h.getUser).toHaveBeenCalledWith('good.jwt')
  })

  it('treats a request with no Authorization header as a guest', async () => {
    // The overwhelmingly common case — every anonymous player, on every request.
    expect(await getProfileFromRequest(req())).toBeNull()
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it.each([['Token abc'], ['Bearer'], ['Bearer    '], ['']])(
    'treats the malformed header %j as a guest without calling out',
    async (header) => {
      expect(await getProfileFromRequest(req({ Authorization: header }))).toBeNull()
      expect(h.getUser).not.toHaveBeenCalled()
    }
  )

  it('fails closed to guest when the service-role key is missing', async () => {
    // Without it we cannot verify the token, and an unverified token must never be honoured.
    h.hasKey = false
    expect(await getProfileFromRequest(req({ Authorization: 'Bearer good.jwt' }))).toBeNull()
    expect(h.getUser).not.toHaveBeenCalled()
  })

  it('returns null when the token is rejected', async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } })
    expect(await getProfileFromRequest(req({ Authorization: 'Bearer expired.jwt' }))).toBeNull()
  })

  it('never throws when verification blows up', async () => {
    // The whole two-worlds rule rests on this: identity failing must not fail a request,
    // because gameplay routes call it and a throw here would take a game down.
    h.getUser.mockRejectedValue(new Error('network down'))
    await expect(getProfileFromRequest(req({ Authorization: 'Bearer good.jwt' }))).resolves.toBeNull()
  })
})

describe('isPermanentAccount', () => {
  it('is false for an anonymous user', async () => {
    expect(await isPermanentAccount(req({ Authorization: 'Bearer good.jwt' }))).toBe(false)
  })

  it('is true only once an email identity is attached', async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: 'p-1', is_anonymous: false } }, error: null })
    expect(await isPermanentAccount(req({ Authorization: 'Bearer good.jwt' }))).toBe(true)
  })

  it('is false when is_anonymous is absent', async () => {
    // An unrecognised user shape must fail to the safer answer, not accidentally unlock
    // account-gated things like clubs or purchases.
    h.getUser.mockResolvedValue({ data: { user: { id: 'p-1' } }, error: null })
    expect(await isPermanentAccount(req({ Authorization: 'Bearer good.jwt' }))).toBe(false)
  })

  it('is false for a guest with no token', async () => {
    expect(await isPermanentAccount(req())).toBe(false)
  })
})
