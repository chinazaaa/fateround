'use client'

import type { WhotSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

export function useWhotTurnTimer(gameCode: string, session: WhotSession | null, enabled: boolean) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/whot/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    resetKey: phase,
  })
}
