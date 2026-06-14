'use client'

import { useAnonymousSessionTimer } from '@/hooks/useAnonymousSessionTimer'
import { ANONYMOUS_ROOM_SESSION_SECONDS } from '@/lib/anonymous-messages'
import type { Game } from '@/types'

export function AnonymousSessionTimerBar({
  gameCode,
  game,
  sticky = false,
}: {
  gameCode: string
  game: Pick<Game, 'status' | 'session_started_at'> | null
  sticky?: boolean
}) {
  const { active, label, secondsLeft } = useAnonymousSessionTimer(gameCode, game)
  if (!active) return null

  const urgent = secondsLeft <= 60
  const progress = Math.max(0, Math.min(100, (secondsLeft / ANONYMOUS_ROOM_SESSION_SECONDS) * 100))

  return (
    <div
      className={
        sticky
          ? 'sticky top-0 z-30 -mx-4 px-4 pt-2 pb-3 bg-[var(--background)]/90 backdrop-blur-md border-b border-white/5'
          : undefined
      }
    >
      <div className={`glass-card px-4 py-3 text-center ${urgent ? 'border border-amber-500/35' : ''}`}>
        <div className="flex items-center justify-center gap-3">
          <p className="text-faint text-xs uppercase tracking-wider">Time remaining</p>
          <p className={`text-2xl font-black tabular-nums ${urgent ? 'text-amber-300' : ''}`}>{label}</p>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-linear ${
              urgent ? 'bg-amber-400' : 'bg-violet-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-faint text-xs mt-2">Session ends automatically after 15 minutes</p>
      </div>
    </div>
  )
}
