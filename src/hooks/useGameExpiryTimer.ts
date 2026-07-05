'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import type { Game } from '@/types'
import { formatCountdown } from '@/lib/timer-format'

/**
 * Whole-game countdown shared by the duration-capped board games. Ticks down to
 * `session_started_at + game_duration_seconds`, and once it hits zero repeatedly
 * asks the server to end the game (POST `endpoint`) until the game actually
 * finishes and `active` flips false — a single attempt could be missed (a
 * backgrounded/asleep tab at the zero-crossing, a dropped request), and the server
 * check is idempotent.
 *
 * The retry uses a **self-scheduling `setTimeout`, never `setInterval`**, so only one
 * request is ever in flight: a slow (>retry) expire call can't have a second request
 * race it through the route's separate status check and double-finalize. (This is the
 * pattern the crazy-eights/whot clocks already used; monopoly/scrabble previously used
 * an overlapping `setInterval` — now unified onto the safe one.)
 *
 * `extraActive` lets a caller add a guard beyond "active + duration > 0" (scrabble's
 * chess-clock mode has no whole-game cap, so it must never arm).
 */
export function useGameExpiryTimer({
  endpoint,
  game,
  extraActive = true,
  retryMs = 5000,
}: {
  endpoint: string
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
  extraActive?: boolean
  retryMs?: number
}) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0 && extraActive
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)

  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      // Bound each attempt with an abort ceiling: because the next retry is only
      // scheduled from `finally`, a request that *hangs* (never settles) would
      // otherwise stall the whole retry loop and the game would never expire. The
      // AbortController makes a hung request reject at `retryMs`, so `finally` runs
      // and re-schedules.
      const controller = new AbortController()
      const abortId = setTimeout(() => controller.abort(), retryMs)
      try {
        await fetch(endpoint, { method: 'POST', signal: controller.signal })
      } catch {
        // swallow (including the AbortError when a request exceeds retryMs) — retry below
      } finally {
        clearTimeout(abortId)
        if (!cancelled) retryId = setTimeout(() => void fire(), retryMs)
      }
    }
    void fire()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [active, secondsLeft, endpoint, retryMs])

  return {
    active,
    secondsLeft,
    durationSeconds: duration,
    label: formatCountdown(secondsLeft),
  }
}
