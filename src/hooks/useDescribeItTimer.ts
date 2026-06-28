'use client'

import { useEffect, useRef, useState } from 'react'
import type { DescribeItSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

/**
 * Drives the Describe It clocks. The countdown is displayed for everyone watching
 * (players and viewers alike). Only clients with `canDrive` set ask the server to
 * advance — during a turn it reports expiry, during the break it advances to the
 * next turn. Both server checks are idempotent and deadline-gated, so viewers
 * still see the same numbers without ever firing a transition.
 */
export function useDescribeItTimer(gameCode: string, session: DescribeItSession | null, canDrive: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [breakLeft, setBreakLeft] = useState(0)
  const firingRef = useRef(false)

  const phase = session?.phase ?? null
  const turnDeadline = session?.turn_deadline_at ?? null
  const breakDeadline = session?.break_deadline_at ?? null
  const status = session?.status ?? null

  useEffect(() => {
    if (status === 'finished') {
      setSecondsLeft(0)
      setBreakLeft(0)
      return
    }

    const tick = async () => {
      if (phase === 'turn') {
        const left = secondsUntil(turnDeadline)
        setSecondsLeft(left)
        if (canDrive && left <= 0 && turnDeadline && !firingRef.current) {
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
        if (canDrive && left <= 0 && breakDeadline && !firingRef.current) {
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
  }, [canDrive, phase, turnDeadline, breakDeadline, status, gameCode])

  return {
    secondsLeft,
    breakLeft,
    hasTimer: phase === 'turn' && !!turnDeadline && status !== 'finished',
    urgent: phase === 'turn' && secondsLeft > 0 && secondsLeft <= 10,
  }
}
