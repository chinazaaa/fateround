'use client'

import { useTurnSound } from '@/hooks/useTurnSound'
import { currentTurnPlayerId } from '@/lib/draughts10'
import type { Draughts10Session } from '@/types'

/** Turn cue for Draughts10 (also skips repeats while one player keeps a multi-jump). See {@link useTurnSound}. */
export function useDraughts10TurnSound(session: Draughts10Session | null, myPlayerId: string | null, enabled: boolean) {
  const turnId = session && session.status === 'active' ? currentTurnPlayerId(session) : null
  useTurnSound(turnId, myPlayerId, enabled)
}
