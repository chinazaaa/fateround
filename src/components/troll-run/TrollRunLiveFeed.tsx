'use client'

import React from 'react'
import type { TrollRunEvent } from '@/types'

export interface TrollRunLiveFeedProps {
  events: TrollRunEvent[]
  playerNames: Map<string, string>
}

export function TrollRunLiveFeed({ events, playerNames }: TrollRunLiveFeedProps) {
  // Show most recent 4 events
  const recentEvents = [...events].slice(-4).reverse()

  if (recentEvents.length === 0) {
    return (
      <div className="w-full max-w-[640px] bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2 text-center text-xs text-slate-500">
        🏁 Race underway — watch out for sneaky traps!
      </div>
    )
  }

  return (
    <div className="w-full max-w-[640px] space-y-1.5 overflow-hidden">
      {recentEvents.map((evt) => {
        const name = playerNames.get(evt.player_id) ?? evt.player_name ?? 'Player'
        const isDeath = evt.event_type === 'death'

        return (
          <div
            key={evt.id}
            className={`flex items-center justify-between px-3.5 py-1.5 rounded-lg text-xs border transition-all animate-in fade-in slide-in-from-bottom-1 duration-200 ${
              isDeath
                ? 'bg-rose-950/40 border-rose-900/50 text-rose-200'
                : 'bg-emerald-950/40 border-emerald-900/50 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span>{isDeath ? '💀' : '🎉'}</span>
              <span className="font-bold text-white">{name}</span>
              <span className="text-slate-400">{isDeath ? 'fell for a trap on' : 'cleared'}</span>
              <span className="font-medium text-amber-300">"{evt.level_name || evt.level_id}"</span>
            </div>
            {evt.time_ms && !isDeath && (
              <span className="font-mono text-[10px] text-emerald-400 font-bold">
                {(evt.time_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
