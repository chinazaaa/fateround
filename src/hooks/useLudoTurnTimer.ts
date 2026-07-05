'use client'

import type { LudoSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

export function useLudoTurnTimer(gameCode: string, session: LudoSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/ludo/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    resetKey: phase,
  })
}
