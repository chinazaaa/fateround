'use client'

import { useEffect, useRef } from 'react'
import { authHeaders, ensureServerIdentity } from '@/lib/identity'
import { emitTrophiesEarned } from '@/lib/trophies/earned-events'
import { getPlayerSession } from '@/lib/utils'
import { getDeviceId } from '@/lib/coins/device-id'
import { emitCoinsAwarded, emitGuestCoinsPending } from '@/lib/coins/earn-events'

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
        const deviceId = getDeviceId()

        // Even without an identity, run the attribute call so the SERVER can
        // write the guest earning rows (deviceId keyed). The response `guestCoins`
        // is what the "Sign up to claim X coins" CTA quotes.
        if (!profileId) {
          try {
            const guestRes = await fetch('/api/profile/attribute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameCode, resumeToken: token, deviceId: deviceId ?? undefined }),
            })
            const guestBody = (await guestRes.json().catch(() => null)) as
              | { guestCoins?: { total: number; lines: unknown[] } }
              | null
            if (guestBody?.guestCoins) emitGuestCoinsPending(guestBody.guestCoins, gameCode)
          } catch {
            // silent
          }
          return
        }

        const headers = await authHeaders()
        if (!headers || cancelled) return

        const res = await fetch('/api/profile/attribute', {
          method: 'POST',
          headers,
          body: JSON.stringify({ gameCode, resumeToken: token, deviceId: deviceId ?? undefined }),
        })

        // The award pass runs server-side inside this call and reports what it granted. Emit it
        // so the always-mounted prompt can celebrate without every game view knowing about
        // trophies. `earned` only ever lists trophies from THIS pass, so a replay is silent.
        if (cancelled) return
        const body = (await res.json().catch(() => null)) as
          | {
              earned?: unknown
              gameType?: string
              coins?: { total: number; lines: unknown[] }
            }
          | null
        if (Array.isArray(body?.earned)) emitTrophiesEarned(body.earned, body?.gameType)
        if (body?.coins) emitCoinsAwarded(body.coins, gameCode, body?.gameType)
      } catch {
        // Offline, rate-limited, or the endpoint is unavailable. Nothing to tell the player.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gameCode, status, resumeToken])
}
