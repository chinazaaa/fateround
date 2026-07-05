'use client'

import { useTurnSound } from '@/hooks/useTurnSound'
import { currentTurnPlayerId } from '@/lib/checkers'
import type { CheckersSession } from '@/types'

/** Turn cue for Checkers (also skips repeats while one player keeps a multi-jump). See {@link useTurnSound}. */
export function useCheckersTurnSound(session: CheckersSession | null, myPlayerId: string | null, enabled: boolean) {
  const turnId = session && session.status === 'active' ? currentTurnPlayerId(session) : null
  useTurnSound(turnId, myPlayerId, enabled)
}
