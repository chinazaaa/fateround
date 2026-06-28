'use client'

import { useEffect, useRef, useState } from 'react'
import type { CrazyEightsSession } from '@/types'

function secondsUntil(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function useCrazyEightsTurnTimer(gameCode: string, session: CrazyEightsSession | null, enabled: boolean) {
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
          await fetch('/api/crazy-eights/expire-turn', {
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
