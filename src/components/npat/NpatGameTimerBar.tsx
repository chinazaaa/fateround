'use client'

import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { formatNpatGameDuration } from '@/lib/npat'
import type { Game } from '@/types'

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function NpatGameTimerBar({
  game,
}: {
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
}) {
  const duration = game?.game_duration_seconds ?? 0
  const active = game?.status === 'active' && duration > 0
  const secondsLeft = useDeadlineCountdown(game?.session_started_at, duration, active)

  if (!active) return null

  const urgent = secondsLeft <= 60
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
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted">Game time left</p>
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
      <p className="mt-1.5 text-[10px] text-muted text-center">
        {formatNpatGameDuration(duration)} session — play as many letters as time allows
      </p>
    </div>
  )
}
