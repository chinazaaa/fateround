'use client'

import { useEffect, useRef } from 'react'
import {
  playRoundStartSound,
  playRoundEndSound,
  playVoteSubmittedSound,
  playGameFinishedSound,
} from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, WhotSession } from '@/types'
import { currentPlayerId } from '@/lib/whot'

export function useWhotNotifications({
  game,
  session,
  myPlayerId,
  enabled = true,
}: {
  game: Game | null
  session: WhotSession | null
  myPlayerId: string | null | undefined
  enabled?: boolean
}) {
  const { info } = useToast()
  const readyRef = useRef(false)
  const prevTurnIndexRef = useRef<number | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  const prevPhaseRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !game) return

    if (!readyRef.current) {
      readyRef.current = true
      prevTurnIndexRef.current = session?.current_turn_index ?? null
      prevStatusRef.current = game.status
      prevPhaseRef.current = session?.phase ?? null
      return
    }

    const prevStatus = prevStatusRef.current
    const prevTurnIndex = prevTurnIndexRef.current
    const prevPhase = prevPhaseRef.current
    const currentTurnIndex = session?.current_turn_index ?? null

    if (prevStatus === 'waiting' && game.status === 'active') {
      info('Game started! 🃏')
      playRoundStartSound()
    }

    if (prevStatus === 'active' && (game.status === 'finished' || session?.phase === 'finished')) {
      playGameFinishedSound()
    }

    if (prevPhase !== 'finished' && session?.phase === 'finished') {
      playGameFinishedSound()
    }

    if (
      session &&
      currentTurnIndex !== null &&
      prevTurnIndex !== null &&
      currentTurnIndex !== prevTurnIndex &&
      game.status === 'active' &&
      session.phase !== 'finished'
    ) {
      const nowMyTurn = myPlayerId && currentPlayerId(session) === myPlayerId
      if (nowMyTurn) {
        info('Your turn! 🃏')
        playRoundStartSound()
      } else {
        playRoundEndSound()
      }
    }

    prevTurnIndexRef.current = currentTurnIndex
    prevStatusRef.current = game.status
    prevPhaseRef.current = session?.phase ?? null
  }, [enabled, game, info, myPlayerId, session])
}

export { playVoteSubmittedSound as playWhotActionSound }
