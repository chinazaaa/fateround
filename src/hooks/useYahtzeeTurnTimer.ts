'use client'

import type { YahtzeeSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

/**
 * Counts down from turn_deadline_at every second. When it hits zero, calls
 * POST /api/yahtzee/expire-turn once (idempotent on server). Only runs in the
 * `rolling` phase.
 */
export function useYahtzeeTurnTimer(gameCode: string, session: YahtzeeSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/yahtzee/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase === 'rolling',
    enabled,
    resetKey: phase,
  })
}
