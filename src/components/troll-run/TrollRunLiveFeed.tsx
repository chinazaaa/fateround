'use client'

import React from 'react'
import type { TrollRunEvent } from '@/types'
import { Glyph } from '@/components/icons/Glyph'
import { Flag02Icon, SkullIcon } from '@hugeicons/core-free-icons'
import { TROLL_RUN_STAGE_MAX_WIDTH } from '@/components/troll-run/TrollRunCanvas'

export interface TrollRunLiveFeedProps {
  events: TrollRunEvent[]
  playerNames: Map<string, string>
}

/**
 * How many rows the feed renders at once, and — via `TROLL_RUN_FEED_HISTORY` — how many its
 * callers need to hold. A race is ten levels for up to six runners with unlimited deaths, so
 * keeping every event would grow without bound over five rounds.
 */
const TROLL_RUN_FEED_VISIBLE = 4
export const TROLL_RUN_FEED_HISTORY = 40

export function TrollRunLiveFeed({ events, playerNames }: TrollRunLiveFeedProps) {
  const seenIds = new Set<string>()
  const uniqueEvents = events.filter((event) => {
    if (!event.id || seenIds.has(event.id)) return false
    seenIds.add(event.id)
    return true
  })
  const recentEvents = uniqueEvents.slice(-TROLL_RUN_FEED_VISIBLE).reverse()

  if (recentEvents.length === 0) {
    return (
      <div
        className="surface-inset text-faint flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs"
        style={{ maxWidth: TROLL_RUN_STAGE_MAX_WIDTH }}
      >
        <Glyph icon={Flag02Icon} size={13} />
        Race underway — watch out for sneaky traps
      </div>
    )
  }

  return (
    <div className="w-full space-y-1.5 overflow-hidden" style={{ maxWidth: TROLL_RUN_STAGE_MAX_WIDTH }}>
      {recentEvents.map((event, position) => {
        const name = playerNames.get(event.player_id) ?? event.player_name ?? 'Player'
        const isDeath = event.event_type === 'death'
        const accent = isDeath ? '#f43f5e' : '#10b981'

        return (
          <div
            key={`${event.id}-${position}`}
            className="flex items-center justify-between gap-2 rounded-lg border px-3.5 py-1.5 text-xs animate-in fade-in slide-in-from-bottom-1 duration-200"
            style={{
              background: `color-mix(in srgb, ${accent} 10%, transparent)`,
              borderColor: `color-mix(in srgb, ${accent} 28%, var(--border))`,
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Glyph
                icon={isDeath ? SkullIcon : Flag02Icon}
                size={13}
                className={`shrink-0 ${isDeath ? 'text-rose-400' : 'text-emerald-400'}`}
              />
              <span className="shrink-0 font-bold text-[var(--foreground)]">{name}</span>
              <span className="text-muted shrink-0">{isDeath ? 'fell for a trap on' : 'cleared'}</span>
              <span className="truncate font-medium text-[var(--primary)]">{event.level_name || event.level_id}</span>
            </div>
            {!isDeath && typeof event.time_ms === 'number' && event.time_ms > 0 && (
              <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-emerald-400">
                {(event.time_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
