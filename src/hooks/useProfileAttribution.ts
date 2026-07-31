'use client'

import { useEffect, useRef } from 'react'
import { authHeaders, ensureServerIdentity } from '@/lib/identity'
import { getPlayerSession } from '@/lib/utils'

type Options = {
  gameCode: string
  /** Current `games.status`. Attribution fires the first time this is 'finished'. */
  status?: string | null
  /**
   * This device's player code. Optional — when omitted it is read from the persisted player
   * session, which is always present by the time a game finishes. Lets callers that don't
   * track the token in state wire this up in one line.
   */
  resumeToken?: string | null
}

/**
 * On the first finished game, create this device's anonymous identity and link the player row
 * to it (`docs/accounts-and-identity-plan.md` §5, Slice 3).
 *
 * FINISH, NOT PAGE LOAD — this is the whole reason the hook exists rather than a call at
 * startup. Anonymous sign-ins are rate-limited to 30/hour per IP, and a NAT'd classroom or a
 * party on one WiFi shares that budget, so spectators, abandoned lobbies and people who merely
 * opened a link must never consume it. By the finish there is finally something worth saving,
 * and the population is exactly the people who actually played.
 *
 * Entirely best-effort. Every failure path is a silent no-op: the player keeps their game, their
 * result and their local name, and simply has no progression. Nothing here may surface an error
 * or block a render — it runs on the finished screen of a game that already went fine.
 */
export function useProfileAttribution({ gameCode, status, resumeToken }: Options): void {
  // Per game code, so finishing a second game in the same tab still attributes.
  const attemptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'finished' || !gameCode) return
    const token = resumeToken ?? getPlayerSession(gameCode)?.resumeToken ?? null
    // No token means this device never held a seat — a spectator or the host watching. There
    // is no player row to attribute, and nothing to save.
    if (!token) return
    if (attemptedRef.current === gameCode) return
    attemptedRef.current = gameCode

    let cancelled = false
    void (async () => {
      try {
        const profileId = await ensureServerIdentity()
        // Null means anonymous sign-in didn't happen — most likely the per-IP rate limit, or
        // the feature isn't enabled yet. Try again after their next finished game.
        if (!profileId || cancelled) return

        const headers = await authHeaders()
        if (!headers || cancelled) return

        await fetch('/api/profile/attribute', {
          method: 'POST',
          headers,
          body: JSON.stringify({ gameCode, resumeToken: token }),
        })
      } catch {
        // Offline, rate-limited, or the endpoint is unavailable. Nothing to tell the player.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gameCode, status, resumeToken])
}
