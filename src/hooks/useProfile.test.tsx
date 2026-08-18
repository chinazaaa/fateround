// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({
  authHeaders: vi.fn(),
  authCb: null as null | (() => void),
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/identity', () => ({ authHeaders: h.authHeaders }))
vi.mock('@/lib/identity-local', () => ({ rememberName: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      // Capture the callback so a test can fire `INITIAL_SESSION` on demand, and hand back a
      // subscription whose unsubscribe we can assert on unmount.
      onAuthStateChange: (cb: () => void) => {
        h.authCb = cb
        return { data: { subscription: { unsubscribe: h.unsubscribe } } }
      },
    },
  },
}))

import { useProfile } from './useProfile'

const SIGNED_IN = {
  id: 'p1',
  handle: 'Mollymauk',
  avatar_url: null,
  is_anonymous: false,
  trophy_points: 5,
  trophy_level: 1,
  current_streak: 0,
  longest_streak: 0,
  last_active_date: null,
  streak_freezes: 0,
}

beforeEach(() => {
  h.authCb = null
  h.unsubscribe.mockReset()
  h.authHeaders.mockReset()
  // /api/profile/me returns the signed-in profile whenever it's actually called (auth headers
  // present). With no headers, fetchProfileShared short-circuits to a guest and never fetches.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ profile: SIGNED_IN }) }))
  )
})

describe('useProfile', () => {
  it('re-fetches on auth-state change, converging a pre-hydration guest onto the real identity', async () => {
    // Mount BEFORE the session has hydrated: authHeaders resolves null, so the first fetch reads
    // a guest — the exact stale snapshot that left a signed-in player nagged to "Save to profile".
    h.authHeaders.mockResolvedValue(null)
    const { result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.profile).toBeNull()

    // Session hydrates: authHeaders now yields a token, and onAuthStateChange fires INITIAL_SESSION.
    h.authHeaders.mockResolvedValue({ 'Content-Type': 'application/json', Authorization: 'Bearer t' })
    expect(h.authCb).toBeTypeOf('function')
    h.authCb!()

    // The hook re-fetches and lands the real identity — no manual refresh needed.
    await waitFor(() => expect(result.current.profile?.is_anonymous).toBe(false))
    expect(result.current.profile?.handle).toBe('Mollymauk')
  })

  it('unsubscribes from auth changes on unmount', async () => {
    h.authHeaders.mockResolvedValue(null)
    const { unmount, result } = renderHook(() => useProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))
    unmount()
    expect(h.unsubscribe).toHaveBeenCalledTimes(1)
  })
})
