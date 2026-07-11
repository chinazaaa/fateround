import { useEffect, useRef } from 'react'
import type { AyoSession } from '@fateround/shared'
import { expireAyoTurn } from '@/lib/game-api'

/**
 * Client watchdog that asks the server to end a timed-out Ayo turn. Mirrors the
 * web `useAyoClockExpiry` — polls once a second and, when the active player's
 * clock hits zero, POSTs to the expire-turn endpoint (debounced 3s so a single
 * expiry doesn't fire repeatedly). Renders nothing.
 */
export function useAyoClockExpiry(gameCode: string, session: AyoSession | null, enabled: boolean) {
  const expiringRef = useRef(false)

  useEffect(() => {
    if (!enabled || !session || session.status !== 'active') return
    const timed = session.a_time_ms != null && session.b_time_ms != null
    if (!timed) return

    const id = setInterval(() => {
      const base = session.current_turn === 'a' ? session.a_time_ms : session.b_time_ms
      if (base == null || !session.turn_started_at) return
      const startedAt = new Date(session.turn_started_at).getTime()
      const remaining = Math.max(0, base - Math.max(0, Date.now() - startedAt))
      if (remaining <= 0 && !expiringRef.current) {
        expiringRef.current = true
        void expireAyoTurn(gameCode).finally(() => {
          setTimeout(() => {
            expiringRef.current = false
          }, 3000)
        })
      }
    }, 1000)

    return () => clearInterval(id)
  }, [gameCode, session, enabled])
}
