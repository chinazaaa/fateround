import { useEffect, useRef } from 'react'
import type { TicTacToeSession } from '@fateround/shared'
import { useAbsoluteDeadline } from '@/components/party/useAbsoluteDeadline'
import { postTicTacToeExpireTurn } from '@/lib/game-api'

const URGENT_THRESHOLD = 10
// De-dupe window so a late realtime reload doesn't re-fire the expire immediately.
const COOLDOWN_MS = 3000

/**
 * Per-turn countdown for Ultimate Tic-Tac-Toe. Ticks `secondsLeft` down to the
 * session's `turn_deadline_at`, and once it hits zero pokes
 * `/api/tic-tac-toe/expire-turn` (idempotent + deadline-gated server-side, so any
 * client may fire). `enabled` gates whether this client drives the countdown at
 * all (e.g. only while the game is active). `onExpired` reloads the board after a
 * successful expire so the auto-advanced/forfeited turn shows up.
 */
export function useTicTacToeTurnTimer(
  gameCode: string,
  session: TicTacToeSession | null,
  enabled: boolean,
  onExpired: () => void
): { secondsLeft: number; hasTimer: boolean; urgent: boolean } {
  const deadlineAt = session?.turn_deadline_at ?? null
  const hasTimer = !!deadlineAt && session?.status !== 'finished'
  const active = enabled && hasTimer
  const secondsLeft = useAbsoluteDeadline(deadlineAt, active)
  const firingRef = useRef(false)

  useEffect(() => {
    if (!active || !gameCode) return
    if (secondsLeft > 0) return
    if (firingRef.current) return
    firingRef.current = true
    void postTicTacToeExpireTurn(gameCode)
      .then(() => onExpired())
      .catch(() => {
        // Swallow: the expire is fire-and-forget and re-fires on the next tick
        // once the cooldown clears.
      })
      .finally(() => {
        setTimeout(() => {
          firingRef.current = false
        }, COOLDOWN_MS)
      })
  }, [active, gameCode, secondsLeft, onExpired])

  return {
    secondsLeft,
    hasTimer,
    urgent: secondsLeft > 0 && secondsLeft <= URGENT_THRESHOLD,
  }
}
