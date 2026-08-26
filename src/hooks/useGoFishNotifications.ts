'use client'

import { useEffect, useRef } from 'react'
import type { Game, GoFishEvent, GoFishSession } from '@/types'
import {
  playCorrectAnswerSound,
  playGameFinishedSound,
  playRoundStartSound,
  playVoteSubmittedSound,
  playWrongAnswerSound,
} from '@/lib/sounds'

/**
 * Go Fish audio cues, driven off the append-only event log + turn pointer.
 *
 * Rules:
 *  - Turn just became mine → a light "your turn" bell (playRoundStartSound).
 *  - I just landed a successful ask → playCorrectAnswerSound.
 *  - I just missed and got "Go Fish!" → playWrongAnswerSound.
 *  - Any player completed a book → playVoteSubmittedSound (a soft ding).
 *  - Game just ended → playGameFinishedSound.
 *
 * The hook is diff-based on `event_log.length` so we only play sounds for events since
 * the last render, not every event in the log on mount — mirroring the Whot pattern.
 */
export function useGoFishNotifications({
  game,
  session,
  myPlayerId,
  enabled = true,
}: {
  game: Game | null
  session: GoFishSession | null
  myPlayerId: string | null | undefined
  enabled?: boolean
}) {
  const readyRef = useRef(false)
  const prevTurnPlayerIdRef = useRef<string | null>(null)
  const prevEventCountRef = useRef<number>(0)
  const prevPhaseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !game || !session) return

    const events = session.event_log ?? []
    const activePlayerId = session.turn_order[session.current_turn_index] ?? null

    // Prime the refs on first render — never play sounds for state that was already there.
    if (!readyRef.current) {
      readyRef.current = true
      prevTurnPlayerIdRef.current = activePlayerId
      prevEventCountRef.current = events.length
      prevPhaseRef.current = session.phase
      return
    }

    // 1. New events since last render — walk only the tail, not the whole log.
    const fresh = events.slice(prevEventCountRef.current) as GoFishEvent[]
    for (const event of fresh) {
      if (event.kind === 'book') {
        void playVoteSubmittedSound()
      } else if (event.kind === 'ask_hit' && event.from_id === myPlayerId) {
        void playCorrectAnswerSound()
      } else if (event.kind === 'ask_miss' && event.from_id === myPlayerId) {
        void playWrongAnswerSound()
      }
    }
    prevEventCountRef.current = events.length

    // 2. Turn just became mine — ring the bell exactly once.
    if (activePlayerId !== prevTurnPlayerIdRef.current) {
      if (myPlayerId && activePlayerId === myPlayerId && session.phase !== 'finished') {
        void playRoundStartSound()
      }
      prevTurnPlayerIdRef.current = activePlayerId
    }

    // 3. Game just ended — flourish for everyone in the room, not only the winner.
    if (prevPhaseRef.current !== 'finished' && session.phase === 'finished') {
      void playGameFinishedSound()
    }
    prevPhaseRef.current = session.phase
  }, [enabled, game, session, myPlayerId])
}
