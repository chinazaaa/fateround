'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { wordHuntTimerSeconds } from '@/lib/word-hunt'
import type { Game } from '@/types'
import { formatMinutesSeconds } from '@/lib/timer-format'

export function useWordHuntGameTimer(
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
      const res = await fetch(`/api/games/${gameCode}/expire-word-hunt`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { finished?: boolean; expired?: boolean }
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
  }, [active, secondsLeft, gameCode, game?.status, requestExpire])

  useEffect(() => {
    if (!active || secondsLeft > 0 || game?.status === 'finished') return

    void refreshAfterExpire()
    const pollId = window.setInterval(() => {
      void refreshAfterExpire()
    }, 2000)

    return () => window.clearInterval(pollId)
  }, [active, secondsLeft, game?.status, refreshAfterExpire])

  return {
    active,
    secondsLeft,
    durationSeconds: duration,
    timeUp: active && secondsLeft <= 0,
    label: formatMinutesSeconds(secondsLeft),
  }
}
