'use client'

import { useEffect, useRef, useState } from 'react'
import type { WordRushSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

export function useWordRushTimer(gameCode: string, session: WordRushSession | null, canDrive: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [intermissionLeft, setIntermissionLeft] = useState(0)
  const firingRef = useRef(false)

  const phase = session?.phase ?? null
  const turnDeadline = session?.turn_deadline_at ?? null
  const intermissionDeadline = session?.intermission_deadline_at ?? null
  const status = session?.status ?? null

  useEffect(() => {
    if (status === 'finished') {
      setTimeout(() => {
        setSecondsLeft(0)
        setIntermissionLeft(0)
      }, 0)
      return
    }

    const tick = async () => {
      if (phase === 'playing' || phase === 'awaiting_prompt') {
        const left = secondsUntil(turnDeadline)
        setSecondsLeft(left)
        if (canDrive && left <= 0 && turnDeadline && !firingRef.current) {
          firingRef.current = true
          try {
            await fetch('/api/word-rush/expire-turn', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode }),
            })
          } finally {
            setTimeout(() => (firingRef.current = false), 2500)
          }
        }
      } else if (phase === 'intermission') {
        const left = secondsUntil(intermissionDeadline)
        setIntermissionLeft(left)
        if (canDrive && left <= 0 && intermissionDeadline && !firingRef.current) {
          firingRef.current = true
          try {
            await fetch('/api/word-rush/advance', {
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
  }, [canDrive, phase, turnDeadline, intermissionDeadline, status, gameCode])

  return {
    secondsLeft,
    intermissionLeft,
    hasTimer: (phase === 'playing' || phase === 'awaiting_prompt') && !!turnDeadline && status !== 'finished',
    urgent: (phase === 'playing' || phase === 'awaiting_prompt') && secondsLeft > 0 && secondsLeft <= 10,
  }
}
