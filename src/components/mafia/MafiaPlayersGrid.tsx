'use client'

import type { MafiaPhase, MafiaPublicPlayer, MafiaRole } from '@/types'
import { MAFIA_ROLE_INFO, MAFIA_TEAM_ROLES, mafiaRoleEmoji } from './mafia-role-info'

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  myPlayerId: string | null
  /** The local player's own role — shown directly on their own tile (not just on death),
   *  so there's no need for a separate "Your Identity" card taking up page space. */
  myRole?: MafiaRole | null
  phase: MafiaPhase
  voteTallies: Record<string, number>
  /** voterId -> targetId, when votes are public — shown as a "→ #N" sign on the voter's own
   *  tile (Wolvesville shows who cast each vote, not just a tally on the target). */
  voteChoices?: Record<string, string>
  /** Who has cast a vote, regardless of anonymity — used to show a "?" sign on a voter's tile
   *  when anonymousVotes is on (Wolvesville still marks that a player voted, just not for whom). */
  votedPlayerIds?: string[]
  anonymousVotes?: boolean
  /** When set, alive non-self tiles become tap targets for the current night action or vote —
   *  the primary way to act, matching Wolvesville (tap the player's photo, not a separate list). */
  onSelect?: (id: string) => void
  /** Currently chosen target(s) — highlighted so the player can see (and change) their pick
   *  before the phase ends. Cupid's two-step pick can hold up to two ids. */
  selectedIds?: string[]
  /** Shows a "Skip" button in the header next to "tap to vote", when voting is active. */
  onSkipVote?: () => void
  skipDisabled?: boolean
}

const TEAM_TEXT: Record<string, string> = {
  village: 'text-emerald-400',
  mafia: 'text-red-400',
  solo: 'text-amber-400',
  special: 'text-pink-400',
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
  myRole,
  phase,
  voteTallies,
  voteChoices = {},
  votedPlayerIds = [],
  anonymousVotes = false,
  onSelect,
  selectedIds = [],
  onSkipVote,
  skipDisabled,
}: MafiaPlayersGridProps) {
  const seatNumberById = new Map(players.map((p) => [p.id, p.seatNumber]))
  const headerSuffix = phase === 'voting' ? ' · tap to vote' : onSelect ? ' · tap to select' : ''
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">Players{headerSuffix}</h3>
        {phase === 'voting' && onSkipVote && (
          <button
            type="button"
            disabled={skipDisabled}
            onClick={onSkipVote}
            className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] rounded-full px-2.5 py-1 transition bg-[var(--surface-inset-bg)]"
          >
            ⏭ Skip
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {players.map((p) => {
          const isMe = p.id === myPlayerId
          const voteCount = voteTallies?.[p.id] ?? 0
          const hasVoted = phase === 'voting' && p.isAlive && votedPlayerIds.includes(p.id)
          const votingForSeat =
            phase === 'voting' && p.isAlive && !anonymousVotes ? seatNumberById.get(voteChoices[p.id]) : undefined
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
              className={`relative flex flex-col items-center justify-center gap-1 aspect-square rounded-2xl border-2 p-2 text-center transition overflow-hidden ${
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
              {votingForSeat == null && (
                <span
                  className={`text-xs font-bold truncate w-full leading-tight ${
                    p.isAlive ? 'text-[var(--foreground)]' : 'line-through text-[var(--muted)]'
                  }`}
                >
                  {p.name}
                  {isMe && <span className="font-normal text-[var(--primary)]"> (you)</span>}
                </span>
              )}
              {isMe && myRole ? (
                <span
                  className={`text-[9px] font-bold uppercase leading-none ${TEAM_TEXT[MAFIA_ROLE_INFO[myRole].team]}`}
                >
                  {mafiaRoleEmoji(myRole)} {MAFIA_ROLE_INFO[myRole].name}
                </span>
              ) : (
                !p.isAlive &&
                p.role && (
                  <span className={`text-[9px] font-bold uppercase leading-none ${roleTeamColor}`}>
                    {mafiaRoleEmoji(p.role)} {p.role.replace(/_/g, ' ')}
                  </span>
                )
              )}
              {(votingForSeat != null || (anonymousVotes && hasVoted)) && (
                <span className="absolute bottom-0 inset-x-0 h-[38%] flex items-center justify-center rounded-b-2xl bg-gradient-to-b from-amber-800 to-amber-900 border-t-2 border-amber-950/40">
                  <span className="text-lg font-black text-white drop-shadow leading-none">
                    {votingForSeat != null ? votingForSeat : '?'}
                  </span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
