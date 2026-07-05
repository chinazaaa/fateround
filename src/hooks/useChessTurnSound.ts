'use client'

import { useTurnSound } from '@/hooks/useTurnSound'
import { currentTurnPlayerId } from '@/lib/chess'
import type { ChessSession } from '@/types'

/** Turn cue for Chess. See {@link useTurnSound}. */
export function useChessTurnSound(session: ChessSession | null, myPlayerId: string | null, enabled: boolean) {
  const turnId = session && session.status === 'active' ? currentTurnPlayerId(session) : null
  useTurnSound(turnId, myPlayerId, enabled)
}
