'use client'

import { useEffect, useRef, useState } from 'react'
import type { ScrabbleSession } from '@/types'

function secondsUntil(at: string | null | undefined): number {
  if (!at) return 0
  return Math.max(0, Math.ceil((new Date(at).getTime() - Date.now()) / 1000))
}

/**
 * Per-turn countdown for Scrabble. Shows the time left on the current turn and,
 * once the deadline passes, asks the server to auto-pass it. The expire call is
 * idempotent and deadline-gated server-side, so it's safe for any client to fire.
 * No countdown runs when the host left the turn timer off (`turn_deadline_at` null).
 */
export function useScrabbleTurnTimer(session: ScrabbleSession | null) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const firingRef = useRef(false)

  const gameId = session?.game_id ?? null
  const deadline = session?.turn_deadline_at ?? null
  const active = session?.phase === 'playing' && !!deadline

  useEffect(() => {
    if (!active) {
      setSecondsLeft(0)
      return
    }
    const tick = async () => {
      const left = secondsUntil(deadline)
      setSecondsLeft(left)
      if (left <= 0 && deadline && gameId && !firingRef.current) {
        firingRef.current = true
        try {
          await fetch('/api/scrabble/expire-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId }),
          })
        } finally {
          setTimeout(() => (firingRef.current = false), 3000)
        }
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 500)
    return () => window.clearInterval(id)
  }, [active, deadline, gameId])

  return {
    secondsLeft,
    hasTimer: active,
    urgent: active && secondsLeft > 0 && secondsLeft <= 10,
  }
}
