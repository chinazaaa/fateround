'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { formatCountdown } from '@/lib/timer-format'
import type { Game } from '@/types'

export function useMatchingPairsGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'timer_seconds'> | null,
  roundStartedAt?: string | null
) {
  const duration = game?.timer_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const anchor = roundStartedAt || game?.session_started_at
  const secondsLeft = useDeadlineCountdown(anchor, duration, active)

  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      try {
        await fetch(`/api/games/${gameCode}/expire-matching-pairs`, { method: 'POST' })
      } catch {
        // Intentionally ignored — fetch errors are retried below
      } finally {
        if (!cancelled) retryId = setTimeout(() => void fire(), 5000)
      }
    }
    void fire()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [active, secondsLeft, gameCode])

  return {
    active,
    secondsLeft,
    durationSeconds: duration,
    label: formatCountdown(secondsLeft),
  }
}
