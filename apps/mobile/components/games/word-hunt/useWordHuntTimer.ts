import { useCallback, useEffect, useRef } from 'react'
import type { Game } from '@fateround/shared'
import { wordHuntTimerSeconds } from '@fateround/shared/word-hunt'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { postExpireWordHunt } from '@/lib/game-api'

/** Format a duration as `m:ss` (minutes may exceed 59; never shows an hours segment). */
export function formatWordHuntCountdown(seconds: number): string {
  const safe = Math.max(0, seconds)
  const m = Math.floor(safe / 60)
  const s = safe % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Mirrors the web `useWordHuntGameTimer` hook: a live countdown anchored on
 * `session_started_at` + the configured timer duration. When it reaches zero the
 * hook drives the server-side expiry endpoint (with retry) so the game finishes,
 * and exposes `timeUp` so the board can be disabled and submits blocked.
 */
export function useWordHuntTimer(
  gameCode: string,
  game: Pick<Game, 'status' | 'session_started_at' | 'timer_seconds'> | null,
  onExpired?: () => void | Promise<void>
) {
  const duration = wordHuntTimerSeconds(game?.timer_seconds)
  const active = game?.status === 'active' && !!game.session_started_at
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)
  const expireInFlightRef = useRef(false)
  const onExpiredRef = useRef(onExpired)
  onExpiredRef.current = onExpired

  const refreshAfterExpire = useCallback(async () => {
    await onExpiredRef.current?.()
  }, [])

  const requestExpire = useCallback(async () => {
    if (expireInFlightRef.current) return false
    expireInFlightRef.current = true
    try {
      const data = await postExpireWordHunt(gameCode)
      if (data.finished || data.expired) {
        await refreshAfterExpire()
        return true
      }
      return false
    } catch {
      return false
    } finally {
      expireInFlightRef.current = false
    }
  }, [gameCode, refreshAfterExpire])

  // Ask the server to finish the game once the local clock hits zero, retrying
  // until it confirms (the server re-verifies the deadline before ending).
  useEffect(() => {
    if (!active || secondsLeft > 0) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const run = async () => {
      if (cancelled) return
      const finished = await requestExpire()
      if (cancelled || finished || game?.status === 'finished') return
      retryTimer = setTimeout(() => void run(), 2000)
    }

    void run()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [active, secondsLeft, game?.status, requestExpire])

  return {
    active,
    secondsLeft,
    durationSeconds: duration,
    timeUp: active && secondsLeft <= 0,
    label: formatWordHuntCountdown(secondsLeft),
  }
}
