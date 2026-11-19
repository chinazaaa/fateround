'use client'

import { useEffect, useRef, useState } from 'react'
import type { WordRushSession } from '@/types'
import { secondsUntil } from '@/lib/timer-format'

const FINALIZE_FIRST_ASK_MS = 3000
const FINALIZE_RETRY_MS = 5000

export function useWordRushTimer(gameCode: string, session: WordRushSession | null, canDrive: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [intermissionLeft, setIntermissionLeft] = useState(0)
  const firingRef = useRef(false)

  const phase = session?.phase ?? null
  const turnDeadline = session?.turn_deadline_at ?? null
  const intermissionDeadline = session?.intermission_deadline_at ?? null
  const status = session?.status ?? null

  // A round was closed but its effects (setter's points, the last-round game finish) are still owed.
  // After the last round the session is `finished`, so the effect below stops and nothing else would
  // make a server request that completes them. The marker is visible here (the session row is
  // public); ask the server to resume it. The first ask waits a few seconds so the normal in-request
  // finalization has finished (the marker then disappears and nothing is sent), and it repeats until
  // the marker clears.
  const finalizePending = !!session?.round_finalize
  useEffect(() => {
    if (!canDrive || !finalizePending) return
    const ask = () => {
      void fetch('/api/word-rush/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode }),
      }).catch(() => undefined)
    }
    let interval: number | undefined
    const first = window.setTimeout(() => {
      ask()
      interval = window.setInterval(ask, FINALIZE_RETRY_MS)
    }, FINALIZE_FIRST_ASK_MS)
    return () => {
      window.clearTimeout(first)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [canDrive, finalizePending, gameCode])

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
