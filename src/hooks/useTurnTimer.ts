'use client'

import { useEffect, useRef, useState } from 'react'
import { secondsUntil } from '@/lib/timer-format'

/**
 * Shared per-turn countdown for the board games. Ticks `secondsLeft` down to a server
 * `turn_deadline_at`, and once it reaches zero asks the server to auto-pass the turn via
 * `endpoint` (POST `{ gameId }`) — idempotent + deadline-gated server-side, so any client
 * may fire. A `firingRef` + `cooldownMs` window de-dupes so a late realtime update can
 * still re-fire. When the server answers `skipped` (or 4xx) — the turn isn't actually
 * expirable — the re-arm backs off exponentially from `cooldownMs` up to `maxBackoffMs`,
 * so a deadline the server won't act on can't be re-POSTed every few seconds forever by
 * every connected client. Any new `deadlineAt` resets the back-off.
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
  maxBackoffMs = 60000,
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
  maxBackoffMs?: number
}) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const firingRef = useRef(false)
  const skipStreakRef = useRef(0)
  const active = enabled && hasTimer
  // Firing gate — separate from display so a client can watch the countdown without
  // driving expiry. Defaults to `enabled` so existing callers are unchanged.
  const mayExpire = (canExpire ?? enabled) && hasTimer

  useEffect(() => {
    if (!active || !deadlineAt) {
      setTimeout(() => setSecondsLeft(0), 0)
      return
    }

    // A new deadline (or a re-arm) is a fresh chance to expire — drop any back-off
    // accrued against the previous one.
    skipStreakRef.current = 0

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && gameCode && mayExpire && !firingRef.current) {
        firingRef.current = true
        // Normally re-armed after `cooldownMs`; longer once the server starts refusing.
        let rearmMs = cooldownMs
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          })
          // The server owns the real deadline. `skipped` (or a 4xx) means it judged the
          // turn not expirable — an already-finished session, or this client's clock
          // running ahead of `turn_deadline_at`. Left unhonoured, every client re-fires
          // against the same dead deadline every `cooldownMs` indefinitely, and each
          // attempt costs a full game-state read. Back off exponentially instead: the
          // deadline may still pass, so we must keep retrying rather than stop outright.
          // Guarded: a non-JSON/empty body (or a stubbed Response) must degrade to "not
          // skipped" rather than throwing into the catch below.
          const payload = res.ok
            ? await Promise.resolve()
                .then(() => (typeof res.json === 'function' ? res.json() : null))
                .catch(() => null)
            : null
          if (!res.ok || payload?.skipped) {
            skipStreakRef.current += 1
            rearmMs = Math.min(cooldownMs * 2 ** skipStreakRef.current, maxBackoffMs)
          } else {
            skipStreakRef.current = 0
          }
        } catch {
          // Swallow — `tick` is fire-and-forget (`void tick()`), so a rejected fetch
          // (network blip, 5xx) must not surface as an unhandled promise rejection.
          // The cooldown below still re-arms so a later tick retries the expire.
        } finally {
          setTimeout(() => {
            firingRef.current = false
          }, rearmMs)
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), intervalMs)
    return () => window.clearInterval(id)
    // resetKey re-arms the interval on a caller-significant change (e.g. phase) that
    // leaves deadlineAt untouched, matching the original per-game effect deps.
  }, [active, mayExpire, deadlineAt, gameCode, endpoint, intervalMs, cooldownMs, maxBackoffMs, resetKey])

  return {
    secondsLeft,
    hasTimer,
    urgent: secondsLeft > 0 && secondsLeft <= urgentThreshold,
  }
}
