'use client'

import React from 'react'
import type { Player, TrollRunPlayerState, TrollRunSession } from '@/types'
import { selectTrollRunRoundStates, trollRunRoundLevelCount } from '@/lib/troll-run'
import { getPlayerGhostColor } from '@/lib/troll-run-engine'
import { Glyph } from '@/components/icons/Glyph'
import { ChampionIcon, Flag02Icon, SkullIcon } from '@hugeicons/core-free-icons'

export interface TrollRunRaceProgressProps {
  session: TrollRunSession
  players: Player[]
  playerStates: TrollRunPlayerState[]
}

/**
 * Live track for the round in progress — one lane per runner showing how far through the round
 * they are and what it cost them. The host dashboard and the viewer screen both show it, so the
 * round filtering and level count live here once.
 */
export function TrollRunRaceProgress({ session, players, playerStates }: TrollRunRaceProgressProps) {
  const levelCount = trollRunRoundLevelCount(session)
  const roundStates = selectTrollRunRoundStates(playerStates, session.current_round)
  const runners = players.filter((player) => player.spectator !== true)

  return (
    <div className="glass-card space-y-3 p-5">
      <div
        className="text-faint flex items-center justify-between gap-2 border-b pb-2 text-[10px] font-bold uppercase tracking-wider"
        style={{ borderColor: 'var(--border)' }}
      >
        <span>Runner</span>
        <span>Level 1 to {levelCount}</span>
        <span>Deaths</span>
      </div>

      <div className="space-y-3">
        {runners.map((player) => {
          const state = roundStates.find((row) => row.player_id === player.id)
          const clearedLevels = Math.min(levelCount, state?.current_level_index ?? 0)
          const progressPct = levelCount > 0 ? Math.min(100, Math.round((clearedLevels / levelCount) * 100)) : 0
          const isFinished = state?.round_finished === true
          // Placement is only decided when the whole round is scored, so a runner who is already
          // home while others are still out gets a plain badge rather than "#" with nothing after it.
          const hasPlacement = typeof state?.finish_position === 'number'
          // Same colour the engine paints this runner's ghost and initial badge with, so a tag on
          // the canvas can be matched to a name here.
          const laneColor = getPlayerGhostColor(player.id)

          return (
            <div key={player.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-bold text-[var(--foreground)]">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-black"
                    style={{ background: laneColor, color: '#0b1120' }}
                    aria-hidden
                  >
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="truncate">{player.name}</span>
                  {isFinished && (
                    <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      <Glyph icon={hasPlacement ? ChampionIcon : Flag02Icon} size={11} />
                      {hasPlacement ? `#${state?.finish_position}` : 'Finished'}
                    </span>
                  )}
                </span>
                <span className="text-muted shrink-0 font-mono text-[11px] tabular-nums">
                  {Math.min(clearedLevels + 1, levelCount)} / {levelCount}
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono font-bold tabular-nums text-rose-400">
                  <Glyph icon={SkullIcon} size={12} />
                  {state?.deaths ?? 0}
                </span>
              </div>

              <div
                className="surface-inset relative h-3 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${player.name} progress`}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPct}%`,
                    background: isFinished
                      ? 'linear-gradient(to right, #10b981, #2dd4bf)'
                      : 'linear-gradient(to right, var(--primary), var(--primary-strong))',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
