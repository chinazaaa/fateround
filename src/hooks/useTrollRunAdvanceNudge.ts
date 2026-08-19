'use client'

import { useEffect, useRef } from 'react'
import { secondsUntil } from '@/lib/timer-format'
import type { TrollRunSession } from '@/types'

/** How often an open tab re-checks whether a Troll Run deadline has passed. */
const TROLL_RUN_NUDGE_INTERVAL_MS = 1000

/**
 * Pushes a Troll Run room past a deadline the clock has already earned.
 *
 * The countdown ending and the round timer expiring are transitions no player action produces,
 * so whichever tab is open asks the server to apply them. The route only applies what the clock
 * already allows, which makes several clients nudging harmless — and necessary, because the
 * host's tab may be backgrounded. It stays on an interval rather than firing once so a request
 * that never lands cannot leave the room stalled on an expired deadline.
 */
export function useTrollRunAdvanceNudge({
  gameCode,
  session,
  hostToken,
  resumeToken,
}: {
  gameCode: string
  session: TrollRunSession | null
  hostToken?: string
  resumeToken?: string | null
}) {
  const inFlightRef = useRef(false)
  const phase = session?.phase
  const deadline = session?.turn_deadline_at ?? null

  useEffect(() => {
    if (!deadline || (phase !== 'countdown' && phase !== 'racing')) return
    // The endpoint authorizes by host token or player resume token; without either there is
    // nothing to send and the other clients in the room carry the phase forward.
    if (!hostToken && !resumeToken) return

    const nudge = async () => {
      if (inFlightRef.current || secondsUntil(deadline) > 0) return
      inFlightRef.current = true
      try {
        await fetch('/api/troll-run/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            ...(hostToken ? { hostToken } : {}),
            ...(resumeToken ? { resumeToken } : {}),
          }),
        })
      } catch {
        // A dropped nudge is retried on the next tick.
      } finally {
        inFlightRef.current = false
      }
    }

    void nudge()

    // Trigger immediately when deadline arrives instead of waiting for next interval tick
    const remainingMs = Math.max(0, new Date(deadline).getTime() - Date.now() + 50)
    const exactTimer = window.setTimeout(() => void nudge(), remainingMs)
    const intervalTimer = window.setInterval(() => void nudge(), TROLL_RUN_NUDGE_INTERVAL_MS)

    return () => {
      window.clearTimeout(exactTimer)
      window.clearInterval(intervalTimer)
    }
  }, [gameCode, phase, deadline, hostToken, resumeToken])
}
