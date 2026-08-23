import { useEffect, useRef } from 'react'
import { apiUrl } from '@/lib/config'
import { authHeaders, ensureServerIdentity } from '@/lib/identity'
import { getPlayerSession } from '@/lib/secure-session'
import { getDeviceId } from '@/lib/coins/device-id'
import { emitCoinsAwarded, emitGuestCoinsPending } from '@/lib/coins/earn-events'

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
 * to it (`docs/accounts-and-identity-plan.md` §5, Slice 3). The server runs the trophy award
 * pass inside this call, so a game that is never attributed never counts — no games_played, no
 * games_won, no trophies.
 *
 * FINISH, NOT APP LAUNCH — anonymous sign-ins are rate-limited to 30/hour per IP, and a NAT'd
 * classroom or a party on one WiFi shares that budget. Spectators and people who merely opened
 * a link must never spend it.
 *
 * ── WHY THERE IS NO `cancelled` FLAG ────────────────────────────────────────────────────────
 * There was, and it silently ate mobile progression. `useGameViewBootstrap` sets `game` and
 * `myResumeToken` in two different renders (they are separated by `await
 * reconcilePlayerSession`), so opening the app onto an already-finished game runs this effect
 * twice: once with a null token, then again with the real one. The old cleanup set
 * `cancelled = true` on the first run — which had, by then, already claimed `attemptedRef` —
 * so run 1 aborted after signing in and run 2 bailed at the guard. Nothing was ever POSTed,
 * for any game, on the most common way a mobile player sees their result.
 *
 * Nothing in here touches component state, so there is nothing an unmount needs to cancel:
 * the request is worth finishing even if the player has already navigated away.
 *
 * Entirely best-effort: every failure is a silent no-op. The player keeps their game, their
 * result and their local name, and simply has no progression.
 */
export function useProfileAttribution({ gameCode, status, resumeToken }: Options): void {
  // Holds the game code while an attempt is in flight or has succeeded. Released again on
  // every failure path, so a rate-limited sign-in or a token that was mid-refresh (routine
  // right after the app returns from the background) retries on the next render or revisit
  // instead of writing the game off forever.
  const attemptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'finished' || !gameCode) return

    void (async () => {
      if (attemptedRef.current === gameCode) return
      try {
        const token = resumeToken ?? (await getPlayerSession(gameCode))?.resumeToken ?? null
        // No token: this device never held a seat (a spectator, or the host watching). There
        // is no player row to attribute. Claim nothing — the run that does have the token,
        // possibly a later render of this same effect, must still be able to proceed.
        if (!token) return

        // Re-check after the await: the token read is async, so a second run can start while
        // this one is suspended.
        if (attemptedRef.current === gameCode) return
        attemptedRef.current = gameCode

        const profileId = await ensureServerIdentity()
        const deviceId = await getDeviceId()

        // Guest earning path — no identity, but still POST so the server can
        // hold this game's pending coins keyed on device id.
        if (!profileId) {
          try {
            const guestRes = await fetch(apiUrl('/api/profile/attribute'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameCode, resumeToken: token, deviceId: deviceId ?? undefined }),
            })
            if (guestRes.ok) {
              const guestBody = (await guestRes.json().catch(() => null)) as {
                guestCoins?: { total: number; lines: unknown[] }
              } | null
              if (guestBody?.guestCoins) emitGuestCoinsPending(guestBody.guestCoins, gameCode)
            }
          } catch {
            // silent
          }
          // Release so a later ensureServerIdentity() (post-rate-limit) still tries.
          attemptedRef.current = null
          return
        }

        const headers = await authHeaders()
        if (!headers) {
          attemptedRef.current = null
          return
        }

        const res = await fetch(apiUrl('/api/profile/attribute'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ gameCode, resumeToken: token, deviceId: deviceId ?? undefined }),
        })
        // The route answers 200 with `attributed: false` for the benign cases (guest, stale
        // token, already claimed) — those are settled, not worth retrying. A transport-level
        // failure is, so only a non-OK response releases the claim.
        if (!res.ok) {
          attemptedRef.current = null
        } else {
          const body = (await res.json().catch(() => null)) as {
            coins?: { total: number; lines: unknown[] }
            gameType?: string
          } | null
          if (body?.coins) emitCoinsAwarded(body.coins, gameCode, body.gameType)
        }
      } catch {
        // Offline or unavailable. Retry on the next finished screen.
        attemptedRef.current = null
      }
    })()
  }, [gameCode, status, resumeToken])
}
