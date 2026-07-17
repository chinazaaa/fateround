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
 * value returned. `enabled` gates whether *this* client shows the countdown (defaults
 * true, for games with no per-client gate). `canExpire` gates whether this client may
 * fire the expire call — it defaults to `enabled`, so display and firing move together
 * unless a caller decouples them (e.g. Ludo lets viewers *see* the countdown but not
 * *drive* it). `resetKey` re-arms the interval on a caller-significant change that
 * leaves `deadlineAt` untouched (e.g. a phase flip), mirroring the original per-game
 * effect dependencies. The expire call is skipped when `gameCode` is empty (preserves
 * the games that gate firing on a resolved game id).
 */
export function useTurnTimer({
  gameCode,
  endpoint,
  deadlineAt,
  hasTimer,
  enabled = true,
  canExpire,
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
  canExpire?: boolean
  resetKey?: unknown
  intervalMs?: number
  urgentThreshold?: number
  cooldownMs?: number
}) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const firingRef = useRef(false)
  const active = enabled && hasTimer
  // Firing gate — separate from display so a client can watch the countdown without
  // driving expiry. Defaults to `enabled` so existing callers are unchanged.
  const mayExpire = (canExpire ?? enabled) && hasTimer

  useEffect(() => {
    if (!active || !deadlineAt) {
      setTimeout(() => setSecondsLeft(0), 0)
      return
    }

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && gameCode && mayExpire && !firingRef.current) {
        firingRef.current = true
        try {
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          })
        } catch {
          // Swallow — `tick` is fire-and-forget (`void tick()`), so a rejected fetch
          // (network blip, 5xx) must not surface as an unhandled promise rejection.
          // The cooldown below still re-arms so a later tick retries the expire.
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
  }, [active, mayExpire, deadlineAt, gameCode, endpoint, intervalMs, cooldownMs, resetKey])

  return {
    secondsLeft,
    hasTimer,
    urgent: secondsLeft > 0 && secondsLeft <= urgentThreshold,
  }
}
