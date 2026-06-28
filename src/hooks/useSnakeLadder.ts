'use client'

import { useEffect, useRef, useState } from 'react'
import { playRoundStartSound, playRoundEndSound, playGameFinishedSound, playDiceRollSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { Game, SnakeLadderSession } from '@/types'
import { currentPlayerId } from '@/lib/snake-and-ladder'

function secondsUntil(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function useSnakeLadderTurnTimer(gameCode: string, session: SnakeLadderSession | null, enabled: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const expiringRef = useRef(false)
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null

  useEffect(() => {
    if (!enabled || !deadlineAt || phase === 'finished') {
      setSecondsLeft(0)
      return
    }

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && !expiringRef.current) {
        expiringRef.current = true
        try {
          await fetch('/api/snake-and-ladder/expire-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          })
        } finally {
          setTimeout(() => {
            expiringRef.current = false
          }, 3000)
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 1000)
    return () => window.clearInterval(id)
  }, [deadlineAt, phase, enabled, gameCode])

  return {
    secondsLeft,
    hasTimer: !!deadlineAt && phase !== 'finished',
    urgent: secondsLeft > 0 && secondsLeft <= 10,
  }
}

export function useSnakeLadderNotifications({
  game,
  session,
  myPlayerId,
  players,
  enabled = true,
}: {
  game: Game | null
  session: SnakeLadderSession | null
  myPlayerId: string | null | undefined
  players: { id: string; name: string }[]
  enabled?: boolean
}) {
  const { info, success } = useToast()
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
      info('Game started! 🎲')
      playRoundStartSound()
    }

    // `game.status` and `session.phase` can flip to finished in separate realtime
    // updates — guard on both so the sound/toast fire only on the first transition.
    const justFinished =
      (prevStatus !== 'finished' && game.status === 'finished') ||
      (prevPhase !== 'finished' && session?.phase === 'finished')

    if (justFinished) {
      playGameFinishedSound()
      const winner = players.find((p) => p.id === session?.winner_player_id)
      if (session?.winner_player_id === myPlayerId) {
        success('You win! 🏆')
      } else if (winner) {
        info(`${winner.name} wins! 🏆`)
      }
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
        info('Your turn! 🎲 Roll the die')
        playRoundStartSound()
      } else {
        playRoundEndSound()
      }
    }

    prevTurnIndexRef.current = currentTurnIndex
    prevStatusRef.current = game.status
    prevPhaseRef.current = session?.phase ?? null
  }, [enabled, game, info, myPlayerId, players, session, success])
}

export { playDiceRollSound as playSnakeLadderRollSound }
export { playVoteSubmittedSound as playSnakeLadderActionSound } from '@/lib/sounds'
