'use client'

import type { UnoSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

export function useUnoTurnTimer(gameCode: string, session: UnoSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/uno/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    resetKey: phase,
  })
}
