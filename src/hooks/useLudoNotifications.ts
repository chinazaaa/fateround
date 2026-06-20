'use client'

import { useEffect, useRef } from 'react'
import {
  playRoundStartSound,
  playRoundEndSound,
  playVoteSubmittedSound,
  playGameFinishedSound,
} from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, LudoSession } from '@/types'
import { currentPlayerId } from '@/lib/ludo'

export function useLudoNotifications({
  game,
  session,
  myPlayerId,
  players,
  enabled = true,
}: {
  game: Game | null
  session: LudoSession | null
  myPlayerId: string | null | undefined
  players: { id: string; name: string }[]
  enabled?: boolean
}) {
  const { info, success } = useToast()
  const readyRef = useRef(false)
  const prevTurnIndexRef = useRef<number | null>(null)
  const prevStatusRef = useRef<string | null>(null)
  const prevPhaseRef = useRef<string | null>(null)
  const prevStatusMessageRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !game) return

    if (!readyRef.current) {
      readyRef.current = true
      prevTurnIndexRef.current = session?.current_turn_index ?? null
      prevStatusRef.current = game.status
      prevPhaseRef.current = session?.phase ?? null
      prevStatusMessageRef.current = session?.status_message ?? null
      return
    }

    const prevStatus = prevStatusRef.current
    const prevTurnIndex = prevTurnIndexRef.current
    const prevPhase = prevPhaseRef.current
    const prevMessage = prevStatusMessageRef.current
    const currentTurnIndex = session?.current_turn_index ?? null
    const message = session?.status_message ?? null

    if (prevStatus === 'waiting' && game.status === 'active') {
      info('Game started! 🎲')
      playRoundStartSound()
    }

    if (prevStatus === 'active' && (game.status === 'finished' || session?.phase === 'finished')) {
      playGameFinishedSound()
      const winner = players.find((p) => p.id === session?.winner_player_id)
      if (session?.winner_player_id === myPlayerId) {
        success('You win! 🏆')
      } else if (winner) {
        info(`${winner.name} wins! 🏆`)
      }
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
        info('Your turn! 🎲 Roll the dice')
        playRoundStartSound()
      } else {
        playRoundEndSound()
      }
    }

    if (
      message &&
      message !== prevMessage &&
      game.status === 'active' &&
      myPlayerId &&
      message.includes('roll again') &&
      (message.toLowerCase().includes('rolled a 6') ||
        message.toLowerCase().includes('doubles') ||
        message.toLowerCase().includes('bonus roll'))
    ) {
      info('Bonus roll — roll again!')
      playRoundStartSound()
    }

    if (
      message &&
      message !== prevMessage &&
      game.status === 'active' &&
      message.includes('sent an opponent home') &&
      myPlayerId
    ) {
      const myName = players.find((p) => p.id === myPlayerId)?.name
      if (myName && message.startsWith(myName)) {
        info('You captured an opponent! 🎯')
        playVoteSubmittedSound()
      }
    }

    prevTurnIndexRef.current = currentTurnIndex
    prevStatusRef.current = game.status
    prevPhaseRef.current = session?.phase ?? null
    prevStatusMessageRef.current = message
  }, [enabled, game, info, myPlayerId, players, session, success])
}

export { playVoteSubmittedSound as playLudoActionSound }
export { playDiceRollSound as playLudoRollSound } from '@/lib/sounds'
