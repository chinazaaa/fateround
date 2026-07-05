'use client'

import { useTurnSound } from '@/hooks/useTurnSound'
import { currentTurnPlayerId } from '@/lib/scrabble-board'
import type { ScrabbleSession } from '@/types'

/** Turn cue for Scrabble. See {@link useTurnSound}. */
export function useScrabbleTurnSound(session: ScrabbleSession | null, myPlayerId: string | null, enabled: boolean) {
  const turnId = session && session.phase === 'playing' ? currentTurnPlayerId(session) : null
  useTurnSound(turnId, myPlayerId, enabled)
}
