'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Game } from '@/types'
import { formatCountdown } from '@/lib/timer-format'

/** Whole-game countdown for Scrabble. Mirrors the Monopoly game clock: shows the
 *  time left and, once it expires, repeatedly asks the server to end the game
 *  until it actually finishes (idempotent server-side). */
export function useScrabbleGameTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds' | 'scrabble_clock_mode'> | null
) {
  const duration = game?.game_duration_seconds ?? 0
  // Chess-clock mode has no whole-game cap — the per-player banks drive timing, so
  // the whole-game expiry must never arm (a stale nonzero duration would otherwise
  // end a chess game early via /expire-scrabble).
  const active = game?.status === 'active' && duration > 0 && game?.scrabble_clock_mode !== 'chess'
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)
  const expired = active && secondsLeft <= 0

  useEffect(() => {
    if (!expired) return
    const fire = () => void fetch(`/api/games/${gameCode}/expire-scrabble`, { method: 'POST' })
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
