'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Game } from '@/types'
import { formatCountdown } from '@/lib/timer-format'

export function useWhotGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)

  // Once the clock hits zero, end the game. A single fire isn't enough: if that one
  // request is dropped (network blip, 500, tab throttled) the game would otherwise keep
  // running past time. Retry until the parent re-renders with status !== 'active' (game
  // finished) and `active` flips false. Self-scheduling setTimeout — never setInterval —
  // so only one request is ever in flight: a slow (>5s) expire call can't have a second
  // request race it through the route's separate status check and double-finalize.
  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      try {
        await fetch(`/api/games/${gameCode}/expire-whot`, { method: 'POST' })
      } catch {
        // swallow — retry below
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
