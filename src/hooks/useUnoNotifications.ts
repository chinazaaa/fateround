'use client'

import { useEffect, useRef } from 'react'
import { playRoundStartSound, playRoundEndSound, playVoteSubmittedSound, playGameFinishedSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, UnoSession } from '@/types'
import { currentPlayerId } from '@/lib/uno'

export function useUnoNotifications({
  game,
  session,
  myPlayerId,
  myHandCount = 0,
  enabled = true,
}: {
  game: Game | null
  session: UnoSession | null
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
  const prevUnoCallRef = useRef<string | null>(null)

  // A player calling "UNO" (either as they play their 2nd-to-last card or via the button)
  // flips uno_called → true for the pending player. Announce it to the whole room once.
  const unoCallKey = session && session.uno_called && session.uno_pending_player ? session.uno_pending_player : null

  useEffect(() => {
    if (!enabled || !game) return

    if (!readyRef.current) {
      readyRef.current = true
      prevTurnIndexRef.current = session?.current_turn_index ?? null
      prevStatusRef.current = game.status
      prevPhaseRef.current = session?.phase ?? null
      prevHandCountRef.current = myHandCount
      prevUnoCallRef.current = unoCallKey
      return
    }

    if (unoCallKey && unoCallKey !== prevUnoCallRef.current && game.status === 'active') {
      const msg =
        session?.status_message && session.status_message.includes('UNO') ? session.status_message : '🎉 UNO called!'
      info(msg)
      playRoundStartSound()
    }
    prevUnoCallRef.current = unoCallKey

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
  }, [enabled, game, info, myHandCount, myPlayerId, session, unoCallKey])
}

export { playVoteSubmittedSound as playUnoActionSound }
