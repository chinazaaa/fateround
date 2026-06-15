'use client'

import { useEffect, useRef } from 'react'
import { playGameFinishedSound, playRoundEndSound, playRoundStartSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { BingoClaim, Game } from '@/types'

export function useBingoStartNotification({
  game,
  enabled = true,
}: {
  game: Game | null
  enabled?: boolean
}) {
  const readyRef = useRef(false)
  const prevStatusRef = useRef<Game['status'] | null>(null)

  useEffect(() => {
    if (!enabled || !game) return

    const status = game.status
    const prevStatus = prevStatusRef.current

    if (!readyRef.current) {
      readyRef.current = true
      prevStatusRef.current = status
      return
    }

    if (prevStatus === 'waiting' && status === 'active') {
      playRoundStartSound()
    }

    prevStatusRef.current = status
  }, [enabled, game, game?.status])
}

export function useBingoWinNotification({
  winner,
  winnerName,
  myPlayerId,
  enabled = true,
}: {
  winner: BingoClaim | null
  winnerName: string | null
  myPlayerId?: string | null
  enabled?: boolean
}) {
  const { info, success } = useToast()
  const readyRef = useRef(false)
  const prevWinnerIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    const winnerId = winner?.status === 'approved' ? winner.id : null

    if (!readyRef.current) {
      readyRef.current = true
      prevWinnerIdRef.current = winnerId
      return
    }

    if (winnerId && winnerId !== prevWinnerIdRef.current && winner) {
      const name = winnerName?.trim() || 'Someone'
      const iWon = !!myPlayerId && winner.player_id === myPlayerId

      if (iWon) {
        success('BINGO! You won!')
        playGameFinishedSound()
      } else {
        info(`${name} got BINGO!`)
        playRoundEndSound()
      }
    }

    prevWinnerIdRef.current = winnerId
  }, [enabled, info, myPlayerId, success, winner, winnerName])
}
