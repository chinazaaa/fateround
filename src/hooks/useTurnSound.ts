'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound } from '@/lib/sounds'

/**
 * Plays a cue when it becomes the local player's turn, so they don't have to watch
 * the screen waiting. Fires only on a real change of `turnId` to `myPlayerId` — never
 * on first render (the first pass just establishes the baseline), and not while the
 * same player keeps the turn (e.g. a multi-jump). The sound helper respects the global
 * mute setting.
 *
 * `turnId` is the current turn's player id, or `null` when there is no live turn — the
 * caller derives it from its own session shape (e.g. `status === 'active'` /
 * `phase === 'playing'` + `currentTurnPlayerId(session)`).
 */
export function useTurnSound(turnId: string | null, myPlayerId: string | null, enabled: boolean) {
  const prevTurnRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const prev = prevTurnRef.current
    prevTurnRef.current = turnId
    if (prev === undefined) return // first render — establish baseline, don't fire
    if (enabled && turnId && turnId !== prev && turnId === myPlayerId) {
      void playRoundStartSound()
    }
  }, [turnId, myPlayerId, enabled])
}
