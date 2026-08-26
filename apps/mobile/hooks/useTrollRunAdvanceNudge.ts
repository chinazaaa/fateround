import { useEffect, useRef } from 'react'
import type { TrollRunSession } from '@fateround/shared'
import { postTrollRunSync } from '@/lib/game-api'

/** How often an open app re-checks whether a Troll Run deadline has passed. */
const TROLL_RUN_NUDGE_INTERVAL_MS = 1000

/**
 * Pushes a Troll Run room past a deadline the clock has already earned.
 *
 * The countdown ending and the round timer expiring are transitions no player action produces, so
 * whichever client is open asks the server to apply them. Unlike web — which posts to the
 * token-guarded `/api/troll-run/advance` — this uses the tokenless `sync` route, so a viewer with
 * no seat can keep a room moving too. Either way the route only applies what the clock already
 * allows, which makes several clients nudging harmless.
 *
 * It stays on an interval rather than firing once so a request that never lands cannot leave the
 * room stalled on an expired deadline.
 */
export function useTrollRunAdvanceNudge({ gameCode, session }: { gameCode: string; session: TrollRunSession | null }) {
  const inFlightRef = useRef(false)
  const phase = session?.phase
  const deadline = session?.turn_deadline_at ?? null

  useEffect(() => {
    if (!deadline || (phase !== 'countdown' && phase !== 'racing')) return

    const nudge = async () => {
      if (inFlightRef.current) return
      if (new Date(deadline).getTime() - Date.now() > 0) return
      inFlightRef.current = true
      try {
        await postTrollRunSync(gameCode)
      } catch {
        // A dropped nudge is retried on the next tick.
      } finally {
        inFlightRef.current = false
      }
    }

    void nudge()

    // Fire the moment the deadline lands rather than waiting up to a full interval for it.
    const remainingMs = Math.max(0, new Date(deadline).getTime() - Date.now() + 50)
    const exact = setTimeout(() => void nudge(), remainingMs)
    const interval = setInterval(() => void nudge(), TROLL_RUN_NUDGE_INTERVAL_MS)

    return () => {
      clearTimeout(exact)
      clearInterval(interval)
    }
  }, [gameCode, phase, deadline])
}
