import { useEffect, useRef } from 'react'
import { apiUrl } from '@/lib/config'
import { authHeaders, ensureServerIdentity } from '@/lib/identity'
import { getPlayerSession } from '@/lib/secure-session'

type Options = {
  gameCode: string
  /** Current `games.status`. Attribution fires the first time this is 'finished'. */
  status?: string | null
  /**
   * This device's player code. Optional — read from the persisted player session when omitted,
   * which is always set by the time a game finishes.
   */
  resumeToken?: string | null
}

/**
 * Mobile mirror of `src/hooks/useProfileAttribution.ts`.
 *
 * On the first finished game, create this device's anonymous identity and link the player row
 * to it (`docs/accounts-and-identity-plan.md` §5, Slice 3).
 *
 * FINISH, NOT APP LAUNCH — anonymous sign-ins are rate-limited to 30/hour per IP, and a NAT'd
 * classroom or a party on one WiFi shares that budget. Spectators and people who merely opened
 * a link must never spend it.
 *
 * Entirely best-effort: every failure is a silent no-op. The player keeps their game, their
 * result and their local name, and simply has no progression.
 */
export function useProfileAttribution({ gameCode, status, resumeToken }: Options): void {
  const attemptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'finished' || !gameCode) return

    let cancelled = false
    void (async () => {
      try {
        const token = resumeToken ?? (await getPlayerSession(gameCode))?.resumeToken ?? null
        // No token: this device never held a seat (a spectator, or the host watching). There
        // is no player row to attribute.
        if (!token || cancelled) return

        // Claim the attempt only once a token actually exists. Marking it earlier — as this
        // did — permanently locks the game out on the very first run, because reading the
        // token here is async: `useGameViewBootstrap` sets `myResumeToken` in a later render
        // than `game.status` (they're separated by `await reconcilePlayerSession`), so the
        // first pass legitimately finds nothing and the retry would then bail at the guard.
        // Attribution would silently never happen on mobile. The web mirror is synchronous,
        // which is why it can check the token before the guard.
        if (attemptedRef.current === gameCode) return
        attemptedRef.current = gameCode

        const profileId = await ensureServerIdentity()
        // Null most likely means the per-IP rate limit, or anonymous sign-in isn't enabled
        // yet. Try again after the next finished game.
        if (!profileId || cancelled) return

        const headers = await authHeaders()
        if (!headers || cancelled) return

        await fetch(apiUrl('/api/profile/attribute'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ gameCode, resumeToken: token }),
        })
      } catch {
        // Offline or unavailable. Nothing to tell the player.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [gameCode, status, resumeToken])
}
