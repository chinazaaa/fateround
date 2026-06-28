'use client'

import { useEffect, useRef, useState } from 'react'
import type { YahtzeeSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

/**
 * Counts down from turn_deadline_at every second.
 * When it hits zero, calls POST /api/yahtzee/expire-turn once (idempotent on server).
 */
export function useYahtzeeTurnTimer(gameCode: string, session: YahtzeeSession | null, enabled: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const expiringRef = useRef(false)
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null

  useEffect(() => {
    if (!enabled || !deadlineAt || phase !== 'rolling') {
      setSecondsLeft(0)
      return
    }

    const tick = async () => {
      const left = secondsUntil(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && !expiringRef.current) {
        expiringRef.current = true
        try {
          await fetch('/api/yahtzee/expire-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          })
        } finally {
          // Reset after 3 s so it can re-fire if the realtime update arrives late
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
    hasTimer: !!deadlineAt && phase === 'rolling',
    urgent: secondsLeft > 0 && secondsLeft <= 10,
  }
}
