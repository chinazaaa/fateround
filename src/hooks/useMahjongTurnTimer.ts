'use client'

import { useEffect, useRef, useState } from 'react'
import type { MahjongSession } from '@/types'
import { mahjongSecondsLeft } from '@/lib/mahjong'

export function useMahjongTurnTimer(gameCode: string, session: MahjongSession | null, enabled: boolean) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const expiringRef = useRef(false)
  const deadlineAt = session?.turn_deadline_at ?? null
  const phase = session?.phase ?? null

  useEffect(() => {
    if (!enabled || !deadlineAt || phase === 'finished') {
      const id = window.setTimeout(() => setSecondsLeft(0), 0)
      return () => window.clearTimeout(id)
    }

    const tick = async () => {
      const left = mahjongSecondsLeft(deadlineAt)
      setSecondsLeft(left)

      if (left <= 0 && !expiringRef.current) {
        expiringRef.current = true
        try {
          await fetch('/api/mahjong/expire-turn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: gameCode }),
          })
        } catch {
          // `tick` is fire-and-forget, so rejected expire requests must not
          // become unhandled promise rejections. The cooldown still allows retry.
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
