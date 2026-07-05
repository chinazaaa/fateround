'use client'

import type { CrazyEightsSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

export function useCrazyEightsTurnTimer(gameCode: string, session: CrazyEightsSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/crazy-eights/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    resetKey: phase,
  })
}
