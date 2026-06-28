'use client'

import { useEffect } from 'react'
import { ANONYMOUS_ROOM_SESSION_SECONDS } from '@/lib/anonymous-messages'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Game } from '@/types'
import { formatMinutesSeconds } from '@/lib/timer-format'

export function useAnonymousSessionTimer(gameCode: string, game: Pick<Game, 'status' | 'session_started_at'> | null) {
  const active = game?.status === 'active'
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, ANONYMOUS_ROOM_SESSION_SECONDS, active)

  useEffect(() => {
    if (!active || secondsLeft > 0) return
    void fetch(`/api/games/${gameCode}/expire-session`, { method: 'POST' })
  }, [active, secondsLeft, gameCode])

  return { secondsLeft, active, label: formatMinutesSeconds(secondsLeft) }
}
