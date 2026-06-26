'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound } from '@/lib/sounds'
import { currentTurnPlayerId } from '@/lib/scrabble-board'
import type { ScrabbleSession } from '@/types'

/**
 * Plays a cue when it becomes the local player's turn, so they don't have to
 * watch the screen waiting. Fires only on a real turn change to `myPlayerId`
 * (never on first render). The sound helper respects the global mute setting.
 */
export function useScrabbleTurnSound(session: ScrabbleSession | null, myPlayerId: string | null, enabled: boolean) {
  const prevTurnRef = useRef<string | null | undefined>(undefined)
  const turnId = session && session.phase === 'playing' ? currentTurnPlayerId(session) : null

  useEffect(() => {
    const prev = prevTurnRef.current
    prevTurnRef.current = turnId
    if (prev === undefined) return // first render — establish baseline, don't fire
    if (enabled && turnId && turnId !== prev && turnId === myPlayerId) {
      void playRoundStartSound()
    }
  }, [turnId, myPlayerId, enabled])
}
