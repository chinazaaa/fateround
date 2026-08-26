'use client'

import type { RummySession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

/** Per-player turn clock — pokes /api/rummy/expire-turn once the deadline lapses. */
export function useRummyTurnTimer(gameCode: string, session: RummySession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/rummy/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    resetKey: `${phase}:${session?.current_turn_index}:${session?.turn_step}`,
  })
}
