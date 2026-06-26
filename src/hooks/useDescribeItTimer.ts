'use client'

import { useEffect, useRef, useState } from 'react'
import type { DescribeItSession } from '@/types'

function secondsUntil(at: string | null | undefined): number {
  if (!at) return 0
  return Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 1000))
}

/**
 * Drives the Describe It clocks. During a turn it counts down the turn timer and
 * reports expiry; during the break it counts down and asks the server to advance
 * to the next turn. Both server checks are idempotent and deadline-gated.
 */
export function useDescribeItTimer(gameCode: string, session: DescribeItSession | null, enabled: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [breakLeft, setBreakLeft] = useState(0)
  const firingRef = useRef(false)

  const phase = session?.phase ?? null
  const turnDeadline = session?.turn_deadline_at ?? null
  const breakDeadline = session?.break_deadline_at ?? null
  const status = session?.status ?? null

  useEffect(() => {
    if (!enabled || status === 'finished') {
      setSecondsLeft(0)
      setBreakLeft(0)
      return
    }

    const tick = async () => {
      if (phase === 'turn') {
        const left = secondsUntil(turnDeadline)
        setSecondsLeft(left)
        if (left <= 0 && turnDeadline && !firingRef.current) {
          firingRef.current = true
          try {
            await fetch('/api/describe-it/expire-turn', {
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
        if (left <= 0 && breakDeadline && !firingRef.current) {
          firingRef.current = true
          try {
            await fetch('/api/describe-it/advance', {
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
  }, [enabled, phase, turnDeadline, breakDeadline, status, gameCode])

  return {
    secondsLeft,
    breakLeft,
    hasTimer: phase === 'turn' && !!turnDeadline && status !== 'finished',
    urgent: phase === 'turn' && secondsLeft > 0 && secondsLeft <= 10,
  }
}
