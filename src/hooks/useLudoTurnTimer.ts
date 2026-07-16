'use client'

import type { LudoSession } from '@/types'
import { useTurnTimer } from '@/hooks/useTurnTimer'

export function useLudoTurnTimer(
  gameCode: string,
  session: LudoSession | null,
  enabled: boolean,
  // Who may fire the expire call — defaults to `enabled`. Ludo passes a stricter
  // gate here (non-viewers only) while leaving `enabled` broad, so viewers still
  // see the countdown but never drive the turn to expire.
  canExpire: boolean = enabled
) {
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null
  return useTurnTimer({
    gameCode,
    endpoint: '/api/ludo/expire-turn',
    deadlineAt,
    hasTimer: !!deadlineAt && phase !== 'finished',
    enabled,
    canExpire,
    resetKey: phase,
  })
}
