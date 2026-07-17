'use client'

import { useEffect, useRef, useState } from 'react'
import type { QuickDrawGuessSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

export function useQuickDrawGuessTimer(gameCode: string, session: QuickDrawGuessSession | null, canDrive: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [breakLeft, setBreakLeft] = useState(0)
  const firingRef = useRef(false)

  const phase = session?.phase ?? null
  const turnDeadline = session?.turn_deadline_at ?? null
  const breakDeadline = session?.break_deadline_at ?? null
  const status = session?.status ?? null

  useEffect(() => {
    if (status === 'finished') {
      setTimeout(() => {
        setSecondsLeft(0)
        setBreakLeft(0)
      }, 0)
      return
    }

    const tick = async () => {
      if (phase === 'turn') {
        const left = secondsUntil(turnDeadline)
        setSecondsLeft(left)
        if (canDrive && left <= 0 && turnDeadline && !firingRef.current) {
          firingRef.current = true
          try {
            await fetch('/api/quick-draw/guess-expire-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode }),
            })
          } finally {
            setTimeout(() => (firingRef.current = false), 2500)
          }
        }
      } else if (phase === 'break') {
        const left = secondsUntil(breakDeadline)
        setBreakLeft(left)
        if (canDrive && left <= 0 && breakDeadline && !firingRef.current) {
          firingRef.current = true
          try {
            await fetch('/api/quick-draw/guess-advance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode }),
            })
          } finally {
            setTimeout(() => (firingRef.current = false), 2500)
          }
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 500)
    return () => window.clearInterval(id)
  }, [canDrive, phase, turnDeadline, breakDeadline, status, gameCode])

  return {
    secondsLeft,
    breakLeft,
    hasTimer: phase === 'turn' && !!turnDeadline && status !== 'finished',
    urgent: phase === 'turn' && secondsLeft > 0 && secondsLeft <= 10,
  }
}
