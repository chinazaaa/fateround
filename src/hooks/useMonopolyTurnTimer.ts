'use client'

import { useEffect, useRef, useState } from 'react'
import type { MonopolyBoard, MonopolyPhase } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

const TIMED_PHASES: MonopolyPhase[] = ['roll', 'jail', 'buy', 'pay_rent', 'raise_funds', 'auction']

export function useMonopolyTurnTimer(gameCode: string, board: MonopolyBoard | null, enabled: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const expiringRef = useRef(false)
  const deadlineAt = board?.turn_deadline_at ?? null
  const phase = board?.phase ?? null

  useEffect(() => {
    if (!enabled || !deadlineAt || !phase || !TIMED_PHASES.includes(phase)) {
      setSecondsLeft(0)
      return
    }

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && !expiringRef.current) {
        expiringRef.current = true
        try {
          await fetch('/api/monopoly/expire-turn', {
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
    hasTimer: !!deadlineAt && !!phase && TIMED_PHASES.includes(phase),
    urgent: secondsLeft > 0 && secondsLeft <= 15,
  }
}
