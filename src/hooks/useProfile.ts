'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/identity'

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
      try {
        const headers = await authHeaders()
        if (!headers) {
          // No session at all — a guest who has never finished a game.
          if (!cancelled) setProfile(null)
          return
        }
        const res = await fetch('/api/profile/me', { headers })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setProfile(data.profile ?? null)
      } catch {
        // Offline or unavailable — the chip falls back to its guest state.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { profile, loading, refresh }
}
