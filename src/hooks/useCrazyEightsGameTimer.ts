'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Game } from '@/types'
import { formatCountdown } from '@/lib/timer-format'

export function useCrazyEightsGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)

  // Once the clock hits zero, end the game. A single fire isn't enough: if that one
  // request is dropped (network blip, 500, tab throttled) the game would otherwise keep
  // running past time. Keep retrying every few seconds until the parent re-renders with
  // status !== 'active' (game finished) and `active` flips false, clearing the interval.
  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    const fire = () => {
      void fetch(`/api/games/${gameCode}/expire-crazy-eights`, { method: 'POST' }).catch(() => {})
    }
    fire()
    const id = setInterval(() => {
      if (!cancelled) fire()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [active, secondsLeft, gameCode])

  return {
    active,
    secondsLeft,
    durationSeconds: duration,
    label: formatCountdown(secondsLeft),
  }
}
