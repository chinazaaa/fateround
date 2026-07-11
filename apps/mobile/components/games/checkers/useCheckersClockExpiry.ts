import { useEffect, useRef } from 'react'
import type { CheckersSession } from '@fateround/shared'
import { postCheckersExpireTurn } from '@/lib/game-api'

/**
 * Watches the active player's cumulative clock and reports a flag-fall to the
 * server when it hits zero. Uses refs + a 1s interval so it never calls setState
 * — the visible clocks tick via the view's own clockTick counter. The server
 * re-checks the deadline, so a slightly-early/late client tick is harmless.
 */
export function useCheckersClockExpiry(
  gameCode: string,
  session: CheckersSession | null,
  enabled: boolean,
  onExpired?: () => void
): void {
  const sessionRef = useRef(session)
  sessionRef.current = session
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired
  const expiringRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      const s = sessionRef.current
      if (!s || s.status !== 'active') return
      if (s.red_time_ms == null || s.black_time_ms == null || !s.turn_started_at) return
      const base = s.current_turn === 'r' ? s.red_time_ms : s.black_time_ms
      const remaining = Math.max(0, base - Math.max(0, Date.now() - Date.parse(s.turn_started_at)))
      if (remaining <= 0 && !expiringRef.current) {
        expiringRef.current = true
        void postCheckersExpireTurn(gameCode)
          .then(() => onExpiredRef.current?.())
          .catch(() => {})
          .finally(() => {
            setTimeout(() => {
              expiringRef.current = false
            }, 3000)
          })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [enabled, gameCode])
}
