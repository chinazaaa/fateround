'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'
import { rememberName } from '@/lib/identity-local'

export type Profile = {
  id: string
  handle: string | null
  avatar_url: string | null
  is_anonymous: boolean
  trophy_points: number
  trophy_level: number
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  streak_freezes: number
}

/**
 * `ok: false` means "the request failed in a way that tells us nothing" — the caller should
 * leave whatever it already had on screen rather than flipping to a guest state on a blip.
 */
type FetchResult = { ok: true; profile: Profile | null } | { ok: false }

/**
 * Shared in-flight request. `MarketingHeader` mounts two `ProfileChip`s at once (the desktop
 * nav and the mobile action bar — CSS hides one, but both stay mounted, exactly as
 * `ThemeButton` does), so without this every page load fires two identical requests.
 */
let inFlight: Promise<FetchResult> | null = null

async function fetchProfileShared(): Promise<FetchResult> {
  if (inFlight) return inFlight
  inFlight = (async (): Promise<FetchResult> => {
    try {
      const headers = await authHeaders()
      // No session at all — a guest who has never finished a game.
      if (!headers) return { ok: true, profile: null }

      const res = await fetch('/api/profile/me', { headers })
      if (!res.ok) {
        // 401/403 means the session was revoked or expired server-side. That genuinely is
        // "no profile", and must clear any cached one: leaving it would show a signed-in name
        // and streak for progress that's no longer reachable, which is the exact thing the
        // "Guest" label exists to communicate.
        if (res.status === 401 || res.status === 403) return { ok: true, profile: null }
        return { ok: false }
      }
      const data = await res.json()
      const profile = (data.profile ?? null) as Profile | null

      // Mirror the handle into the local identity record. That record is what every name
      // prefill already reads — join, create, the lobby, and mobile — so setting a profile name
      // propagates everywhere without any of those surfaces learning about profiles. It also
      // means a signed-in player on a NEW device gets their name back on first load, which the
      // purely-local record could never do.
      if (profile?.handle) rememberName(profile.handle)

      return { ok: true, profile }
    } catch {
      return { ok: false }
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * The signed-in player's own profile, or null for a guest.
 *
 * DELIBERATELY DOES NOT CALL `ensureServerIdentity()`. Rendering a header must never *create*
 * an identity — anonymous sign-ins are rate-limited to 30/hour per IP, and spending that budget
 * on someone who merely loaded the home page is exactly what the finish-time creation rule
 * exists to avoid (`docs/accounts-and-identity-plan.md` §2.2). No session, no request.
 */
export function useProfile(): { profile: Profile | null; loading: boolean; refresh: () => void } {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await fetchProfileShared()
      if (cancelled) return
      if (result.ok) setProfile(result.profile)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { profile, loading, refresh }
}
