'use client'

import type { MafiaPhase, MafiaPublicPlayer } from '@/types'
import { MAFIA_TEAM_ROLES, mafiaRoleEmoji } from './mafia-role-info'

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  myPlayerId: string | null
  phase: MafiaPhase
  voteTallies: Record<string, number>
  /** When set, alive non-self tiles become tap targets for the current night action or vote —
   *  the primary way to act, matching Wolvesville (tap the player's photo, not a separate list). */
  onSelect?: (id: string) => void
  /** Currently chosen target(s) — highlighted so the player can see (and change) their pick
   *  before the phase ends. Cupid's two-step pick can hold up to two ids. */
  selectedIds?: string[]
}

/**
 * Numbered player roster tiles, styled after Wolvesville's grid: seat numbers, a tombstone
 * for eliminated players (with their revealed role), a "(you)" tag + highlighted border on
 * the local player's own tile, vote-count badges during voting, and — when `onSelect` is
 * provided — tap-to-act/vote selection with a highlighted border on the current pick.
 */
export function MafiaPlayersGrid({
  players,
  myPlayerId,
  phase,
  voteTallies,
  onSelect,
  selectedIds = [],
}: MafiaPlayersGridProps) {
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] mb-3">
        Players{onSelect ? ' · tap to select' : ''}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {players.map((p) => {
          const isMe = p.id === myPlayerId
          const voteCount = voteTallies?.[p.id] ?? 0
          const isSelected = selectedIds.includes(p.id)
          const clickable = !!onSelect && p.isAlive && !isMe
          const roleTeamColor = p.role
            ? MAFIA_TEAM_ROLES.includes(p.role)
              ? 'text-red-400'
              : p.role === 'jester'
                ? 'text-amber-400'
                : 'text-emerald-400'
            : ''
          return (
            <button
              key={p.id}
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => onSelect?.(p.id) : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 aspect-square rounded-2xl border-2 p-2 text-center transition ${
                !p.isAlive
                  ? 'bg-[var(--surface-inset-bg)] border-[var(--border)] opacity-70'
                  : isSelected
                    ? 'bg-emerald-500/10 border-emerald-400'
                    : isMe
                      ? 'bg-[var(--surface-inset-bg)] border-[var(--primary)]'
                      : 'bg-[var(--surface-inset-bg)] border-[var(--border)]'
              } ${clickable ? 'cursor-pointer hover:border-[var(--primary)]' : ''}`}
            >
              <span className="absolute top-1 left-1 text-[10px] font-black bg-black/55 text-white rounded-full w-5 h-5 flex items-center justify-center leading-none">
                {p.seatNumber}
              </span>
              {p.isAlive && phase === 'voting' && voteCount > 0 && (
                <span className="absolute top-1 right-1 text-[10px] font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center leading-none">
                  {voteCount}
                </span>
              )}
              {isSelected && (
                <span className="absolute bottom-1 right-1 text-xs" aria-hidden>
                  ✅
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
