'use client'

import type { MafiaPhase, MafiaPublicPlayer } from '@/types'

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  phase: MafiaPhase
  voteTallies: Record<string, number>
}

export function MafiaPlayersGrid({ players, phase, voteTallies }: MafiaPlayersGridProps) {
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] mb-3">Players</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {players.map((p) => {
          const voteCount = voteTallies?.[p.id] ?? 0
          return (
            <div
              key={p.id}
              className={`flex flex-col p-2.5 rounded-xl border text-xs transition ${
                p.isAlive
                  ? 'bg-[var(--surface-inset-bg)] border-[var(--border)]'
                  : 'bg-[var(--surface-inset-bg)] border-[var(--border)] opacity-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span>{p.isAlive ? '👤' : '💀'}</span>
                <span
                  className={`font-semibold truncate ${
                    p.isAlive ? 'text-[var(--foreground)]' : 'line-through text-[var(--muted)]'
                  }`}
                >
                  {p.name}
                </span>
              </div>
              {!p.isAlive && p.role && (
                <span
                  className={`text-[10px] font-bold uppercase mt-0.5 ${
                    p.role === 'mafia' ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {p.role}
                </span>
              )}
              {p.isAlive && phase === 'day' && voteCount > 0 && (
                <span className="text-[10px] text-red-400 font-bold mt-0.5">
                  {voteCount} vote{voteCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
