import { useEffect, useRef } from 'react'
import type { YahtzeeSession } from '@fateround/shared'
import { postYahtzeeExpireTurn } from '@/lib/game-api'

/**
 * Client watchdog for a timed Yahtzee turn. Mirrors web `useYahtzeeTurnTimer`'s
 * expiry half: once `turn_deadline_at` passes (only during the `rolling` phase),
 * POSTs to /api/yahtzee/expire-turn once (debounced 3s; server is idempotent).
 * Renders nothing.
 */
export function useYahtzeeTurnExpiry(gameCode: string, session: YahtzeeSession | null, enabled: boolean) {
  const expiringRef = useRef(false)

  useEffect(() => {
    const deadlineAt = session?.turn_deadline_at
    if (!enabled || !session || !deadlineAt || session.phase !== 'rolling') return

    const id = setInterval(() => {
      const remaining = new Date(deadlineAt).getTime() - Date.now()
      if (remaining <= 0 && !expiringRef.current) {
        expiringRef.current = true
        void postYahtzeeExpireTurn(gameCode).finally(() => {
          setTimeout(() => {
            expiringRef.current = false
          }, 3000)
        })
      }
    }, 1000)

    return () => clearInterval(id)
  }, [gameCode, session, enabled])
}
