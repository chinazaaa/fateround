'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound, playRoundEndSound, playVoteSubmittedSound, playGameFinishedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, CrazyEightsSession } from '@/types'
import { currentPlayerId } from '@/lib/crazy-eights'

export function useCrazyEightsNotifications({
  game,
  session,
  myPlayerId,
  myHandCount = 0,
  enabled = true,
}: {
  game: Game | null
  session: CrazyEightsSession | null
  myPlayerId: string | null | undefined
  myHandCount?: number
  enabled?: boolean
}) {
  const { info } = useToast()
  const readyRef = useRef(false)
  const prevTurnIndexRef = useRef<number | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  const prevPhaseRef = useRef<string | null>(null)
  const prevHandCountRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || !game) return

    if (!readyRef.current) {
      readyRef.current = true
      prevTurnIndexRef.current = session?.current_turn_index ?? null
      prevStatusRef.current = game.status
      prevPhaseRef.current = session?.phase ?? null
      prevHandCountRef.current = myHandCount
      return
    }

    const prevStatus = prevStatusRef.current
    const prevTurnIndex = prevTurnIndexRef.current
    const prevPhase = prevPhaseRef.current
    const prevHandCount = prevHandCountRef.current
    const currentTurnIndex = session?.current_turn_index ?? null

    if (prevHandCount !== null && myHandCount > prevHandCount) {
      const gained = myHandCount - prevHandCount
      info(`You drew ${gained} card${gained === 1 ? '' : 's'} 🃏`)
      playVoteSubmittedSound()
    }

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
    prevHandCountRef.current = myHandCount
  }, [enabled, game, info, myHandCount, myPlayerId, session])
}

export { playVoteSubmittedSound as playCrazyEightsActionSound }
