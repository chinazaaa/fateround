'use client'

import { useEffect, useRef, useState } from 'react'
import { secondsUntil } from '@/lib/timer-format'

/**
 * Shared per-turn countdown for the board games. Ticks `secondsLeft` down to a server
 * `turn_deadline_at`, and once it reaches zero asks the server to auto-pass the turn via
 * `endpoint` (POST `{ gameId }`) — idempotent + deadline-gated server-side, so any client
 * may fire. A `firingRef` + `cooldownMs` window de-dupes so a late realtime update can
 * still re-fire.
 *
 * The game-specific "is there a live timer right now" test is passed in as `hasTimer`
 * (typically: deadline present AND the phase/status is a timed one) — it is also the
 * value returned. `enabled` gates whether *this* client drives it (defaults true, for
 * games with no per-client gate). `resetKey` re-arms the interval on a caller-significant
 * change that leaves `deadlineAt` untouched (e.g. a phase flip), mirroring the original
 * per-game effect dependencies. The expire call is skipped when `gameCode` is empty
 * (preserves the games that gate firing on a resolved game id).
 */
export function useTurnTimer({
  gameCode,
  endpoint,
  deadlineAt,
  hasTimer,
  enabled = true,
  resetKey,
  intervalMs = 1000,
  urgentThreshold = 10,
  cooldownMs = 3000,
}: {
  gameCode: string
  endpoint: string
  deadlineAt: string | null
  hasTimer: boolean
  enabled?: boolean
  resetKey?: unknown
  intervalMs?: number
  urgentThreshold?: number
  cooldownMs?: number
}) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const firingRef = useRef(false)
  const active = enabled && hasTimer

  useEffect(() => {
    if (!active || !deadlineAt) {
      setSecondsLeft(0)
      return
    }

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && gameCode && !firingRef.current) {
        firingRef.current = true
        try {
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          })
        } finally {
          setTimeout(() => {
            firingRef.current = false
          }, cooldownMs)
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), intervalMs)
    return () => window.clearInterval(id)
    // resetKey re-arms the interval on a caller-significant change (e.g. phase) that
    // leaves deadlineAt untouched, matching the original per-game effect deps.
  }, [active, deadlineAt, gameCode, endpoint, intervalMs, cooldownMs, resetKey])

  return {
    secondsLeft,
    hasTimer,
    urgent: secondsLeft > 0 && secondsLeft <= urgentThreshold,
  }
}
