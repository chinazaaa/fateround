'use client'

import { useEffect, useRef, useState } from 'react'
import type { WhotSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

export function useWhotTurnTimer(gameCode: string, session: WhotSession | null, enabled: boolean) {
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
          await fetch('/api/whot/expire-turn', {
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
