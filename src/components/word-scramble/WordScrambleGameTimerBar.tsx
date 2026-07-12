'use client'

import { useEffect } from 'react'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { formatCountdown } from '@/lib/timer-format'
import type { Game } from '@/types'

/**
 * Countdown bar for the shared word-scramble race. A duration of 0 means "no limit" so the
 * bar hides itself. Fires the best-effort client expiry endpoint once the clock hits zero,
 * retrying until the finished status arrives via realtime.
 */
export function WordScrambleGameTimerBar({
  gameCode,
  game,
  onExpired,
}: {
  gameCode: string
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
  /** Called after each expiry attempt so the view can re-fetch and switch to the finished
   *  screen even if the realtime status update is missed. */
  onExpired?: () => void
}) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)

  useEffect(() => {
    if (!active || secondsLeft > 0) return
    let cancelled = false
    let retryId: ReturnType<typeof setTimeout> | undefined
    const fire = async () => {
      try {
        await fetch(`/api/games/${gameCode}/expire-word-scramble`, { method: 'POST' })
      } catch {
        // Best-effort; retry until the game status update arrives.
      } finally {
        // Re-fetch regardless of the response — realtime can miss the status flip, which would
        // otherwise strand the player on the 0:00 screen until a manual refresh.
        if (!cancelled) {
          onExpired?.()
          retryId = setTimeout(() => void fire(), 5000)
        }
      }
    }
    void fire()
    return () => {
      cancelled = true
      if (retryId) clearTimeout(retryId)
    }
  }, [active, secondsLeft, gameCode, onExpired])

  if (!active) return null

  const urgent = secondsLeft <= 30
  const progress = Math.max(0, Math.min(100, (secondsLeft / duration) * 100))

  return (
    <div
      className={[
        'rounded-xl border px-3 py-2 sm:px-4 sm:py-2.5',
        urgent
          ? 'border-amber-500/35 bg-[color-mix(in_srgb,var(--marry)_8%,var(--card))]'
          : 'border-[var(--border-strong)] bg-[var(--card-strong)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted">Time left</p>
        <p className={`text-lg sm:text-xl font-black tabular-nums ${urgent ? 'text-[var(--marry)]' : ''}`}>
          {formatCountdown(secondsLeft)}
        </p>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-inset-bg)] overflow-hidden">
        <div
          className={[
            'h-full rounded-full transition-[width] duration-500 ease-linear',
            urgent ? 'bg-[var(--marry)]' : 'bg-[var(--primary)]',
          ].join(' ')}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-muted text-center">When time runs out, the current scores are final</p>
    </div>
  )
}
