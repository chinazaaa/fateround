'use client'

import type { GoFishSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

/**
 * Client-side turn countdown for Go Fish. Wraps the shared useTurnTimer so the countdown
 * value + the expiry poke go through one path. When `session.turn_deadline_at` hits zero
 * the client posts to /api/gofish/expire-turn; the server verifies the deadline has
 * actually passed before auto-playing.
 */
export function useGoFishTurnTimer(gameCode: string, session: GoFishSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/gofish/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    resetKey: phase,
  })
}
