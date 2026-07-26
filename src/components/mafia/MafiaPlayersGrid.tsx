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
  mafiaTeammateNightTargets?: Record<string, string | null>
  /** The local mafia player's own submitted night target — so their tile shows the same
   *  🎯 banner teammates' tiles get, and the target tile can tally all mafia picks. */
  myNightTarget?: string | null
  /** Every role the Mafia Seer has revealed so far (myState.mafiaSeerRevealedRoles) — only
   *  ever populated for mafia-team viewers, so a checked player's role/emoji shows on
   *  their tile just like a teammate's would, without needing the seer to relay it. */
  mafiaSeerRevealedRoles?: Record<string, MafiaRole>
  /** The two Lovers' ids (from myState.loverIds) — only populated for Cupid and the two
   *  Lovers themselves, so their tiles get a heart badge visible only to people in the know. */
  loverIds?: string[]
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
  /** Medium's revive targets dead players — flip the alive requirement so tombstone tiles
   *  become tappable instead of alive ones. */
  allowDeadSelect?: boolean
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
