'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound, playRoundEndSound, playVoteSubmittedSound, playGameFinishedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, WhotSession } from '@/types'
import { currentPlayerId } from '@/lib/whot'

export function useWhotNotifications({
  game,
  session,
  myPlayerId,
  myHandCount = 0,
  enabled = true,
}: {
  game: Game | null
  session: WhotSession | null
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
  const prevStatusMessageRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !game) return

    if (!readyRef.current) {
      readyRef.current = true
      prevTurnIndexRef.current = session?.current_turn_index ?? null
      prevStatusRef.current = game.status
      prevPhaseRef.current = session?.phase ?? null
      prevHandCountRef.current = myHandCount
      prevStatusMessageRef.current = session?.status_message ?? null
      return
    }

    const prevStatus = prevStatusRef.current
    const prevTurnIndex = prevTurnIndexRef.current
    const prevPhase = prevPhaseRef.current
    const prevHandCount = prevHandCountRef.current
    const prevStatusMessage = prevStatusMessageRef.current
    const currentTurnIndex = session?.current_turn_index ?? null
    const statusMessage = session?.status_message ?? null

    if (prevHandCount !== null && myHandCount > prevHandCount && session?.status_message?.includes('General Market')) {
      const gained = myHandCount - prevHandCount
      info(`General Market — you drew ${gained} card${gained === 1 ? '' : 's'} 🛒`)
      playVoteSubmittedSound()
    }

    // The draw pile auto-reshuffles the discards when it empties; if even that leaves nothing,
    // a plain draw or Pick 2/Pick 3 penalty silently passes the turn with no hand-count change —
    // call both out so no one wonders why nothing happened. General Market (card 14) gets its own
    // marker: it keeps the current player's turn even when dealing ran out, so it must never be
    // reported as "turn passes".
    if (statusMessage && statusMessage !== prevStatusMessage && game.status === 'active') {
      if (statusMessage.includes('not everyone could be dealt in')) {
        info('🚫 Not enough cards for a full General Market')
      } else if (statusMessage.includes('deck reshuffled')) {
        info('🔄 Draw pile empty — discards shuffled back in')
      } else if (statusMessage.includes('draw pile empty')) {
        info('🚫 No cards left to draw — turn passes')
      }
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
    prevStatusMessageRef.current = statusMessage
  }, [enabled, game, info, myHandCount, myPlayerId, session])
}

export { playVoteSubmittedSound as playWhotActionSound }
