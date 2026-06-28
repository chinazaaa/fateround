'use client'

import { useEffect, useRef, useState } from 'react'
import type { TicTacToeSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

export function useTicTacToeTurnTimer(gameCode: string, session: TicTacToeSession | null, enabled: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const expiringRef = useRef(false)
  const deadlineAt = session?.turn_deadline_at ?? null
  const status = session?.status ?? null

  useEffect(() => {
    if (!enabled || !deadlineAt || status === 'finished') {
      setSecondsLeft(0)
      return
    }

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && !expiringRef.current) {
        expiringRef.current = true
        try {
          await fetch('/api/tic-tac-toe/expire-turn', {
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
  }, [deadlineAt, status, enabled, gameCode])

  return {
    secondsLeft,
    hasTimer: !!deadlineAt && status !== 'finished',
    urgent: secondsLeft > 0 && secondsLeft <= 10,
  }
}
