'use client'

import type { ReactNode } from 'react'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { Game } from '@/types'

export interface WinnerStat {
  value: ReactNode
  label: string
}

/**
 * Shared "finished / winner" hero for game results screens.
 *
 * Renders the trophy, a "{winner} wins!" headline (winner's name in the app's
 * accent), and a game-label subtitle. An optional stats strip (Rounds / Players /
 * Duration, etc.) is game-specific — pass `stats` when a game wants it, otherwise
 * it's omitted. Uses the app's current design tokens so it stays consistent with
 * the rest of the surfaces.
 */
export function FinishedWinnerHero({
  winnerName,
  game,
  subtitle,
  stats,
}: {
  /** Name of the first-place player. When absent, falls back to a neutral "Game over!". */
  winnerName?: string | null
  game: Pick<Game, 'title' | 'game_type'>
  /** Overrides the game-label subtitle line (defaults to the game type's label). */
  subtitle?: ReactNode
  /** Optional stat strip; omit for games that don't have generic stats to show. */
  stats?: WinnerStat[]
}) {
  const cfg = gameTypeConfig(parseGameType(game.game_type))

  return (
    <div className="text-center space-y-2">
      <div
        className="text-5xl sm:text-6xl leading-none"
        style={{ filter: 'drop-shadow(0 6px 14px color-mix(in srgb, var(--primary) 25%, transparent))' }}
      >
        🏆
      </div>
      <h2 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight text-body">
        {winnerName ? (
          <>
            <span className="gradient-title">{winnerName}</span> wins!
          </>
        ) : (
          'Game over!'
        )}
      </h2>
      <p className="text-faint text-[11px] font-bold uppercase tracking-[0.16em]">{subtitle ?? cfg.label}</p>

      {stats && stats.length > 0 && (
        <div className="flex gap-2 sm:gap-3 pt-2">
          {stats.map((s) => (
            <div key={s.label} className="glass-card flex-1 px-2 py-3 text-center">
              <div className="text-xl font-black text-body tabular-nums">{s.value}</div>
              <div className="text-faint text-[10px] uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
