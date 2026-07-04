'use client'

import { useState } from 'react'
import {
  formatScrabbleGameDuration,
  SCRABBLE_GAME_TIME_EXTENSION_OPTIONS,
  SCRABBLE_MAX_GAME_DURATION_SECONDS,
} from '@/lib/scrabble'
import { useToast } from '@/components/ui/Toast'
import { ScrabbleGameTimerBar } from '@/components/scrabble/ScrabbleGameTimerBar'
import type { Game } from '@/types'

export function ScrabbleHostTimeExtension({
  gameCode,
  game,
  hostToken,
  onExtended,
}: {
  gameCode: string
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds' | 'scrabble_clock_mode'>
  hostToken: string
  onExtended: () => void | Promise<void>
}) {
  const { success, error: toastError } = useToast()
  const [extending, setExtending] = useState<number | null>(null)
  const duration = game.game_duration_seconds ?? 0
  // Chess-clock mode has no whole-game cap to extend.
  const hasTimer = game.status === 'active' && duration > 0 && game.scrabble_clock_mode !== 'chess'

  if (!hasTimer) return <ScrabbleGameTimerBar gameCode={gameCode} game={game} />

  const addTime = async (extensionSeconds: number) => {
    if (extending != null) return
    setExtending(extensionSeconds)
    try {
      const res = await fetch(`/api/games/${gameCode}/extend-scrabble-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, extensionSeconds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add time')
      success(`Added ${formatScrabbleGameDuration(extensionSeconds)} to the game`)
      await onExtended()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to add time')
    } finally {
      setExtending(null)
    }
  }

  const remainingCapacity = SCRABBLE_MAX_GAME_DURATION_SECONDS - duration

  return (
    <div className="space-y-2">
      <ScrabbleGameTimerBar gameCode={gameCode} game={game} />
      <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--card-strong)] px-3 py-2.5 sm:px-4 sm:py-3 space-y-2">
        <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted">Add game time</p>
        <div className="flex flex-wrap gap-2">
          {SCRABBLE_GAME_TIME_EXTENSION_OPTIONS.map((seconds) => {
            const disabled = extending != null || seconds > remainingCapacity
            return (
              <button
                key={seconds}
                type="button"
                disabled={disabled}
                onClick={() => void addTime(seconds)}
                className="btn-secondary btn-fit px-3 py-1.5 text-xs sm:text-sm disabled:opacity-40"
              >
                {extending === seconds ? 'Adding…' : `+${formatScrabbleGameDuration(seconds)}`}
              </button>
            )
          })}
        </div>
        {remainingCapacity <= 0 && <p className="text-[11px] text-muted">Maximum game length reached.</p>}
      </div>
    </div>
  )
}
