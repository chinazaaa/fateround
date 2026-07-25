'use client'

import type { MafiaPhase, MafiaPublicPlayer } from '@/types'
import { MAFIA_TEAM_ROLES, mafiaRoleEmoji } from './mafia-role-info'

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  myPlayerId: string | null
  phase: MafiaPhase
  voteTallies: Record<string, number>
}

/**
 * Numbered player roster tiles, styled after Wolvesville's grid: seat numbers, a tombstone
 * for eliminated players (with their revealed role), a "(you)" tag + highlighted border on
 * the local player's own tile, and vote-count badges during voting.
 */
export function MafiaPlayersGrid({ players, myPlayerId, phase, voteTallies }: MafiaPlayersGridProps) {
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] mb-3">Players</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {players.map((p) => {
          const isMe = p.id === myPlayerId
          const voteCount = voteTallies?.[p.id] ?? 0
          const roleTeamColor = p.role
            ? MAFIA_TEAM_ROLES.includes(p.role)
              ? 'text-red-400'
              : p.role === 'jester'
                ? 'text-amber-400'
                : 'text-emerald-400'
            : ''
          return (
            <div
              key={p.id}
              className={`relative flex flex-col items-center justify-center gap-1 aspect-square rounded-2xl border-2 p-2 text-center transition ${
                !p.isAlive
                  ? 'bg-[var(--surface-inset-bg)] border-[var(--border)] opacity-70'
                  : isMe
                    ? 'bg-[var(--surface-inset-bg)] border-[var(--primary)]'
                    : 'bg-[var(--surface-inset-bg)] border-[var(--border)]'
              }`}
            >
              <span className="absolute top-1 left-1 text-[10px] font-black bg-black/55 text-white rounded-full w-5 h-5 flex items-center justify-center leading-none">
                {p.seatNumber}
              </span>
              {p.isAlive && phase === 'voting' && voteCount > 0 && (
                <span className="absolute top-1 right-1 text-[10px] font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center leading-none">
                  {voteCount}
                </span>
              )}
              <span className="text-3xl leading-none">{p.isAlive ? '🧑' : '🪦'}</span>
              <span
                className={`text-xs font-bold truncate w-full leading-tight ${
                  p.isAlive ? 'text-[var(--foreground)]' : 'line-through text-[var(--muted)]'
                }`}
              >
                {p.name}
                {isMe && <span className="font-normal text-[var(--primary)]"> (you)</span>}
              </span>
              {!p.isAlive && p.role && (
                <span className={`text-[9px] font-bold uppercase leading-none ${roleTeamColor}`}>
                  {mafiaRoleEmoji(p.role)} {p.role.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
