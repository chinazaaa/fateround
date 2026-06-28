'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Game } from '@/types'
import { formatCountdown } from '@/lib/timer-format'

export function useMonopolyGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)
  const expired = active && secondsLeft <= 0

  // Once the deadline passes, keep asking the server to end the game until it
  // actually finishes. `secondsLeft` clamps at 0, so a single attempt could be
  // missed (a backgrounded/asleep tab at the exact zero-crossing, a dropped
  // request); retrying until `active` flips false makes expiry reliable as long
  // as any client has the game open. The server check is idempotent.
  useEffect(() => {
    if (!expired) return
    const fire = () => void fetch(`/api/games/${gameCode}/expire-monopoly`, { method: 'POST' })
    fire()
    const id = window.setInterval(fire, 5000)
    return () => window.clearInterval(id)
  }, [expired, gameCode])

  return {
    active,
    secondsLeft,
    durationSeconds: duration,
    label: formatCountdown(secondsLeft),
  }
}
