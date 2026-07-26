'use client'

import type { MafiaPhase, MafiaPublicPlayer, MafiaRole } from '@/types'
import { MAFIA_ROLE_INFO, MAFIA_TEAM_ROLES, mafiaRoleEmoji } from './mafia-role-info'

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  myPlayerId: string | null
  myRole?: MafiaRole | null
  mafiaTeammateIds?: string[]
  mafiaTeammateRoles?: Record<string, MafiaRole>
  mafiaTeammateNightTargets?: Record<string, string | null>
  myNightTarget?: string | null
  mafiaSeerRevealedRoles?: Record<string, MafiaRole>
  loverIds?: string[]
  phase: MafiaPhase
  voteTallies: Record<string, number>
  voteChoices?: Record<string, string>
  votedPlayerIds?: string[]
  anonymousVotes?: boolean
  onSelect?: (id: string) => void
  selectedIds?: string[]
  allowSelfSelect?: boolean
  allowDeadSelect?: boolean
  skipRequestCount?: number
  skipRequiredCount?: number
  hasRequestedSkip?: boolean
  skipDisabled?: boolean
  onSkip?: () => void
}

const TEAM_TEXT: Record<string, string> = {
  village: 'text-emerald-400',
  mafia: 'text-red-400',
  solo: 'text-amber-400',
  special: 'text-pink-400',
}

// What each role's night tap actually does — "tap to select" alone doesn't say whether
// you're killing, protecting, or investigating someone.
const NIGHT_ACTION_VERB: Partial<Record<MafiaRole, string>> = {
  doctor: 'the player to protect',
  bodyguard: 'the player to protect',
  aura_seer: 'the player to reveal the alignment of',
  detective: 'two players to compare teams',
  tracker: 'the player to watch',
  vigilante: 'the player to kill',
  mafia: 'the player to kill',
  alpha_wolf: 'the player to kill',
  wolf_cub: 'the player to kill',
  framer: 'the player to frame',
  serial_killer: 'the player to kill',
  arsonist: 'two players to douse',
  medium: 'a dead player to revive',
  cupid: 'two players to link as Lovers',
  seer: 'the player to reveal the exact role of',
  mafia_seer: 'the player to reveal the exact role of',
  red_lady: 'the player to visit',
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
  mafiaTeammateIds = [],
  mafiaTeammateRoles = {},
  mafiaTeammateNightTargets,
  myNightTarget,
  mafiaSeerRevealedRoles = {},
  loverIds = [],
  phase,
  voteTallies,
  voteChoices = {},
  votedPlayerIds = [],
  anonymousVotes = false,
  onSelect,
  selectedIds = [],
  allowSelfSelect = false,
  allowDeadSelect = false,
  skipRequestCount,
  skipRequiredCount,
  hasRequestedSkip,
  skipDisabled,
  onSkip,
}: MafiaPlayersGridProps) {
  const seatNumberById = new Map(players.map((p) => [p.id, p.seatNumber]))
  const amIAlive = players.find((p) => p.id === myPlayerId)?.isAlive !== false
  const myHasVoted = myPlayerId ? votedPlayerIds.includes(myPlayerId) : false
  let headerSuffix = ''
  if (phase === 'voting') {
    headerSuffix = amIAlive ? (myHasVoted ? ' · tap to unvote' : ' · tap to vote') : ''
  } else if (onSelect && myRole) {
    const verb = NIGHT_ACTION_VERB[myRole]
    headerSuffix = verb ? ` · tap to select ${verb}` : ' · tap to select'
  }
  // Roster size varies 5-16 — a fixed 4-wide grid leaves a nearly-empty last row for small
  // games (e.g. 6 players: 4+2). Pick the tightest square-ish column count instead, so a
  // 6-player game reads as a clean 3x2/3x3 and a 16-player game still fills a full 4x4.
  // Night target tally: how many mafia members are targeting each player (teammates + self).
  const nightTargetTally = new Map<string, number>()
  const MAFIA_KILL_VOTERS: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer']
  if (phase === 'night' && myRole && MAFIA_KILL_VOTERS.includes(myRole)) {
    if (myNightTarget) nightTargetTally.set(myNightTarget, (nightTargetTally.get(myNightTarget) ?? 0) + 1)
    if (mafiaTeammateNightTargets) {
      for (const targetId of Object.values(mafiaTeammateNightTargets)) {
        if (targetId) nightTargetTally.set(targetId, (nightTargetTally.get(targetId) ?? 0) + 1)
      }
    }
  }

  const cols = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(players.length))))
  const gridColsClass = cols === 3 ? 'grid-cols-3' : 'grid-cols-4'
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-4 sm:p-5 min-w-0 w-full">
      <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
        <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] truncate">
          Players{headerSuffix}
        </h3>
        {onSkip && skipRequiredCount != null && (
          <button
            type="button"
            disabled={skipDisabled || hasRequestedSkip}
            onClick={onSkip}
            className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--primary)] rounded-full px-2.5 py-1 transition bg-[var(--surface-inset-bg)] disabled:opacity-60"
          >
            ⏭ {hasRequestedSkip ? 'Skipped' : 'Skip'} ({skipRequestCount ?? 0}/{skipRequiredCount})
          </button>
        )}
      </div>
      <div className={`grid ${gridColsClass} gap-1.5 sm:gap-2 min-w-0`}>
        {players.map((p) => {
          const isMe = p.id === myPlayerId
          const voteCount = voteTallies?.[p.id] ?? 0
          const hasVoted = phase === 'voting' && p.isAlive && votedPlayerIds.includes(p.id)
          const votingForSeat =
            phase === 'voting' && p.isAlive && !anonymousVotes ? seatNumberById.get(voteChoices[p.id]) : undefined
          const isSelected = selectedIds.includes(p.id)
          const clickable = !!onSelect && (allowDeadSelect ? !p.isAlive : p.isAlive) && (!isMe || allowSelfSelect)
          const isTeammate = !isMe && mafiaTeammateIds.includes(p.id)
          const isKnownLover = loverIds.includes(p.id)
          const teammateRole = isTeammate ? mafiaTeammateRoles[p.id] : undefined
          const teammateNightTarget =
            isTeammate && phase === 'night' && mafiaTeammateNightTargets ? mafiaTeammateNightTargets[p.id] : undefined
          const myOwnNightTarget = isMe && phase === 'night' && myNightTarget ? myNightTarget : undefined
          const nightTargetForTile = teammateNightTarget ?? myOwnNightTarget
          const nightTargetSeat = nightTargetForTile ? seatNumberById.get(nightTargetForTile) : undefined
          const nightTally = nightTargetTally.get(p.id) ?? 0
          const revealedRole = p.role ?? teammateRole ?? mafiaSeerRevealedRoles[p.id]
          const roleTeamColor = revealedRole
            ? MAFIA_TEAM_ROLES.includes(revealedRole)
              ? 'text-red-400'
              : revealedRole === 'jester'
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
                      : isTeammate
                        ? 'bg-red-500/10 border-red-500/40'
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
              {isKnownLover &&
                !(p.isAlive && phase === 'voting' && voteCount > 0) &&
                !(p.isAlive && phase === 'night' && nightTally > 0) && (
                  <span className="absolute top-1 right-1 text-xs" aria-hidden title="Lover">
                    💘
                  </span>
                )}
              {isSelected && (
                <span className="absolute bottom-1 right-1 text-xs" aria-hidden>
                  ✅
                </span>
              )}
              {isTeammate && p.isAlive && (
                <span className="absolute bottom-1 left-1 text-xs" aria-hidden title="Mafia crew">
                  🔪
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
                {p.revivedByMedium && p.isAlive && (
                  <span aria-hidden title="Revived by the Medium">
                    {' '}
                    🔮
                  </span>
                )}
              </span>
              {isMe && myRole ? (
                <span
                  className={`text-[9px] font-bold uppercase leading-none ${TEAM_TEXT[MAFIA_ROLE_INFO[myRole].team]}`}
                >
                  {mafiaRoleEmoji(myRole)} {MAFIA_ROLE_INFO[myRole].name}
                </span>
              ) : (
                revealedRole && (
                  <span className={`text-[9px] font-bold uppercase leading-none ${roleTeamColor}`}>
                    {mafiaRoleEmoji(revealedRole)} {MAFIA_ROLE_INFO[revealedRole]?.name ?? revealedRole}
                  </span>
                )
              )}
              {nightTargetSeat != null && (
                <span className="absolute bottom-0 inset-x-0 h-[22%] flex items-center justify-center rounded-b-2xl bg-gradient-to-b from-red-800 to-red-900 border-t-2 border-red-950/40">
                  <span className="text-sm font-black text-white drop-shadow leading-none">🎯 {nightTargetSeat}</span>
                </span>
              )}
              {p.isAlive && phase === 'night' && nightTally > 0 && (
                <span className="absolute top-1 right-1 text-[10px] font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center leading-none">
                  {nightTally}
                </span>
              )}
              {(votingForSeat != null || (anonymousVotes && hasVoted)) && (
                <span className="absolute bottom-0 inset-x-0 h-[22%] flex items-center justify-center rounded-b-2xl bg-gradient-to-b from-amber-800 to-amber-900 border-t-2 border-amber-950/40">
                  <span className="text-sm font-black text-white drop-shadow leading-none">
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
