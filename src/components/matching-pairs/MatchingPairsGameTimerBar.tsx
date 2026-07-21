'use client'

import { useMatchingPairsGameTimer } from '@/hooks/useMatchingPairsGameTimer'
import type { Game } from '@/types'

export function MatchingPairsGameTimerBar({
  gameCode,
  game,
  roundStartedAt,
}: {
  gameCode: string
  game: Pick<Game, 'status' | 'session_started_at' | 'timer_seconds'> | null
  roundStartedAt?: string | null
}) {
  const { active, label, secondsLeft, durationSeconds } = useMatchingPairsGameTimer(gameCode, game, roundStartedAt)
  if (!active) return null

  const urgent = secondsLeft <= 60
  const progress = Math.max(0, Math.min(100, (secondsLeft / durationSeconds) * 100))

  return (
    <div
      className={[
        'sticky top-[3.75rem] z-30 rounded-xl border px-3 py-2 sm:px-4 sm:py-2.5',
        urgent
          ? 'border-amber-500/35 bg-[color-mix(in_srgb,var(--marry)_8%,var(--card))]'
          : 'border-[var(--border-strong)] bg-[var(--card-strong)]',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted">Game time left</p>
        <p className={`text-lg sm:text-xl font-black tabular-nums ${urgent ? 'text-[var(--marry)]' : ''}`}>{label}</p>
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
