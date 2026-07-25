'use client'

import type { MafiaPhase, MafiaPublicPlayer, MafiaRole } from '@/types'
import { MAFIA_ROLE_INFO, MAFIA_TEAM_ROLES, mafiaRoleEmoji } from './mafia-role-info'

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  myPlayerId: string | null
  /** The local player's own role — shown directly on their own tile (not just on death),
   *  so there's no need for a separate "Your Identity" card taking up page space. */
  myRole?: MafiaRole | null
  /** Fellow mafia-team ids (from myState.mafiaTeammateIds) — their tiles get the shared mafia
   *  symbol and their real role shown, since the crew can see each other regardless of a text
   *  list, matching Wolvesville's shared crew marker on the roster instead of a name panel. */
  mafiaTeammateIds?: string[]
  mafiaTeammateRoles?: Record<string, MafiaRole>
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
  /** Cupid's role text says they can link two players "possibly including yourself" — set
   *  during Cupid's pick so their own tile becomes tappable too, instead of the usual
   *  self-target block that applies to every other role. */
  allowSelfSelect?: boolean
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
  detective: 'the player to reveal the role of',
  tracker: 'the player to watch',
  vigilante: 'the player to kill',
  mafia: 'the player to kill',
  alpha_wolf: 'the player to kill',
  framer: 'the player to frame',
  serial_killer: 'the player to kill',
  arsonist: 'the player to douse',
  cupid: 'two players to link as Lovers',
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
  phase,
  voteTallies,
  voteChoices = {},
  votedPlayerIds = [],
  anonymousVotes = false,
  onSelect,
  selectedIds = [],
  allowSelfSelect = false,
}: MafiaPlayersGridProps) {
  const seatNumberById = new Map(players.map((p) => [p.id, p.seatNumber]))
  const amIAlive = players.find((p) => p.id === myPlayerId)?.isAlive !== false
  let headerSuffix = ''
  if (phase === 'voting') {
    // A dead player can't vote — showing "tap to vote" to them is a dead instruction.
    headerSuffix = amIAlive ? ' · tap to vote' : ''
  } else if (onSelect && myRole) {
    const verb = NIGHT_ACTION_VERB[myRole]
    headerSuffix = verb ? ` · tap to select ${verb}` : ' · tap to select'
  }
  // Roster size varies 5-16 — a fixed 4-wide grid leaves a nearly-empty last row for small
  // games (e.g. 6 players: 4+2). Pick the tightest square-ish column count instead, so a
  // 6-player game reads as a clean 3x2/3x3 and a 16-player game still fills a full 4x4.
  const cols = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(players.length))))
  const gridColsClass = cols === 3 ? 'grid-cols-3' : 'grid-cols-4'
  return (
    <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">Players{headerSuffix}</h3>
      </div>
      <div className={`grid ${gridColsClass} gap-1.5 sm:gap-2`}>
        {players.map((p) => {
          const isMe = p.id === myPlayerId
          const voteCount = voteTallies?.[p.id] ?? 0
          const hasVoted = phase === 'voting' && p.isAlive && votedPlayerIds.includes(p.id)
          const votingForSeat =
            phase === 'voting' && p.isAlive && !anonymousVotes ? seatNumberById.get(voteChoices[p.id]) : undefined
          const isSelected = selectedIds.includes(p.id)
          const clickable = !!onSelect && p.isAlive && (!isMe || allowSelfSelect)
          const isTeammate = !isMe && mafiaTeammateIds.includes(p.id)
          const teammateRole = isTeammate ? mafiaTeammateRoles[p.id] : undefined
          const revealedRole = p.role ?? teammateRole
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
                revealedRole && (
                  <span className={`text-[9px] font-bold uppercase leading-none ${roleTeamColor}`}>
                    {mafiaRoleEmoji(revealedRole)} {revealedRole.replace(/_/g, ' ')}
                  </span>
                )
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
