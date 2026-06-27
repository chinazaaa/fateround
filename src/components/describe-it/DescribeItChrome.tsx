'use client'

import type { ReactNode } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { gameTypeConfig } from '@/lib/game-types'
import { teamLabel, type DescribeItPlayerScore, type DescribeItTeamScore } from '@/lib/describe-it'
import type { Player } from '@/types'

/** Per-team accent classes. `badge` is a solid high-contrast pill for the team name. */
export const TEAM_STYLES: { chip: string; ring: string; badge: string; dot: string }[] = [
  { chip: 'bg-sky-500/20 border-sky-500/60', ring: 'ring-sky-400', badge: 'bg-sky-600 text-white', dot: 'bg-sky-500' },
  {
    chip: 'bg-pink-500/20 border-pink-500/60',
    ring: 'ring-pink-400',
    badge: 'bg-pink-600 text-white',
    dot: 'bg-pink-500',
  },
  {
    chip: 'bg-emerald-500/20 border-emerald-500/60',
    ring: 'ring-emerald-400',
    badge: 'bg-emerald-600 text-white',
    dot: 'bg-emerald-500',
  },
  {
    chip: 'bg-amber-500/20 border-amber-500/60',
    ring: 'ring-amber-400',
    badge: 'bg-amber-500 text-black',
    dot: 'bg-amber-500',
  },
]

export function teamStyle(team: number) {
  return TEAM_STYLES[(team - 1) % TEAM_STYLES.length]!
}

/** Solid colored pill showing the team name — readable in any theme. */
export function TeamBadge({ team, className = '' }: { team: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-black ${teamStyle(team).badge} ${className}`}
    >
      {teamLabel(team)}
    </span>
  )
}

export function DescribeItShell({
  children,
  title,
  compact,
  wide,
}: {
  children: ReactNode
  title?: string
  compact?: boolean
  /** Wider container so a side column (e.g. the individual leaderboard) has room. */
  wide?: boolean
}) {
  const cfg = gameTypeConfig('describe_it')
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div
        className={[
          'page-wrap flex flex-col items-center px-3 overflow-y-auto justify-start',
          compact ? 'py-3 sm:py-4' : 'py-8 sm:py-10',
        ].join(' ')}
      >
        <div
          className={[
            wide ? 'w-full max-w-3xl' : 'w-full max-w-lg',
            compact ? 'space-y-2' : 'space-y-5 sm:space-y-6',
          ].join(' ')}
        >
          {compact && title && (
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-lg leading-none">{cfg.card.emoji}</span>
              <p className="text-sm font-bold text-[var(--foreground)] truncate">{title}</p>
            </div>
          )}
          {!compact && title && (
            <header className="text-center space-y-2">
              <div className="inline-flex items-center justify-center gap-2">
                <span className="text-3xl drop-shadow-lg">{cfg.card.emoji}</span>
                <GameTypeBadge gameType="describe_it" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title drop-shadow-sm">{title}</h1>
            </header>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

export function DescribeItCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`glass-card ${className}`}>{children}</div>
}

export function DescribeItPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        'btn-primary w-full py-3 text-base font-bold transition-all',
        disabled || loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98]',
        className,
      ].join(' ')}
    >
      {loading ? '…' : children}
    </button>
  )
}

export function DescribeItLoadingScreen() {
  return (
    <DescribeItShell>
      <DescribeItCard className="p-8 text-center">
        <p className="text-muted animate-pulse">Loading game…</p>
      </DescribeItCard>
    </DescribeItShell>
  )
}

/** Live team scoreboard, sorted highest first, with the active + your team marked. */
export function DescribeItScoreboard({
  scores,
  activeTeam,
  myTeam,
  round,
  totalRounds,
}: {
  scores: DescribeItTeamScore[]
  activeTeam?: number | null
  myTeam?: number | null
  round?: number
  totalRounds?: number
}) {
  return (
    <DescribeItCard className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="label-caps">Scores</p>
        {round != null && totalRounds != null && (
          <p className="text-faint text-xs font-semibold">
            Round {Math.min(round, totalRounds)} of {totalRounds}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {scores.map((s) => {
          const st = teamStyle(s.team)
          const active = activeTeam === s.team
          const isMine = myTeam === s.team
          return (
            <div
              key={s.team}
              className={[
                'flex items-center justify-between rounded-xl border px-3 py-2',
                st.chip,
                active ? `ring-2 ${st.ring}` : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5">
                <TeamBadge team={s.team} />
                {isMine ? <span className="text-[10px] font-bold text-faint">you</span> : null}
                {active ? <span title="On the clock">⏱</span> : null}
              </span>
              <span className="text-lg font-black tabular-nums">{s.score}</span>
            </div>
          )
        })}
      </div>
    </DescribeItCard>
  )
}

/** Live per-player leaderboard for individual mode, highest first. */
export function DescribeItPlayerScoreboard({
  leaderboard,
  describerId,
  myPlayerId,
  round,
  totalRounds,
}: {
  leaderboard: DescribeItPlayerScore[]
  describerId?: string | null
  myPlayerId?: string | null
  round?: number
  totalRounds?: number
}) {
  return (
    <DescribeItCard className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="label-caps">Leaderboard</p>
        {round != null && totalRounds != null && (
          <p className="text-faint text-xs font-semibold">
            Round {Math.min(round, totalRounds)} of {totalRounds}
          </p>
        )}
      </div>
      <div className="space-y-1">
        {leaderboard.map((p, i) => {
          const isMine = p.id === myPlayerId
          const isDescriber = p.id === describerId
          return (
            <div
              key={p.id}
              className={[
                'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm',
                isMine ? 'bg-[var(--primary)]/10 font-semibold' : '',
                isDescriber ? 'ring-1 ring-[var(--primary)]/40' : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-faint tabular-nums w-5 shrink-0">{i + 1}.</span>
                <span className="truncate">{p.name}</span>
                {isDescriber ? <span title="Describing now">🗣️</span> : null}
                {isMine ? <span className="text-[10px] text-faint shrink-0">(you)</span> : null}
              </span>
              <span className="text-base font-black tabular-nums shrink-0">{p.score}</span>
            </div>
          )
        })}
      </div>
    </DescribeItCard>
  )
}

/** Roster grouped by team — used in the lobby and host setup. */
export function DescribeItTeamRoster({
  numTeams,
  teamRows,
  players,
  myPlayerId,
  describerId,
  onPick,
  picking,
  onMoveTeam,
  moving,
}: {
  numTeams: number
  teamRows: { player_id: string; team: number }[]
  players: Player[]
  myPlayerId?: string | null
  describerId?: string | null
  onPick?: (team: number) => void
  picking?: boolean
  /** Host-only: move any player to another team. Shows per-player team buttons. */
  onMoveTeam?: (playerId: string, team: number) => void
  moving?: boolean
}) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null

  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: numTeams }, (_, i) => {
        const team = i + 1
        const st = teamStyle(team)
        const members = teamRows.filter((r) => r.team === team)
        const mine = myTeam === team
        return (
          <div key={team} className={`rounded-2xl border p-3 space-y-2 ${st.chip}`}>
            <div className="flex items-center justify-between">
              <TeamBadge team={team} />
              <span className="text-faint text-xs">{members.length}</span>
            </div>
            <ul className="space-y-1 min-h-[1.5rem]">
              {members.map((m) => (
                <li key={m.player_id} className="text-sm flex items-center gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                  <span className="truncate">{nameById.get(m.player_id) ?? 'Player'}</span>
                  {m.player_id === myPlayerId && <span className="text-faint text-[10px] shrink-0">(you)</span>}
                  {m.player_id === describerId && <span className="text-[10px] shrink-0">🗣️</span>}
                  {onMoveTeam && numTeams > 1 && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <span className="text-faint text-[10px] font-semibold uppercase tracking-wide">move</span>
                      {Array.from({ length: numTeams }, (_, j) => j + 1)
                        .filter((t) => t !== team)
                        .map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => onMoveTeam(m.player_id, t)}
                            disabled={moving}
                            title={`Move to ${teamLabel(t)}`}
                            className={`flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-black leading-none shadow-sm ring-1 ring-black/10 disabled:opacity-50 ${teamStyle(t).badge}`}
                          >
                            {t}
                          </button>
                        ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {onPick && (
              <button
                type="button"
                onClick={() => onPick(team)}
                disabled={picking || mine}
                className={[
                  'w-full rounded-lg border py-1.5 text-xs font-bold transition-colors',
                  mine
                    ? 'border-[var(--border)] text-faint'
                    : 'border-[var(--border-strong)] hover:bg-[var(--primary)]/10',
                ].join(' ')}
              >
                {mine ? 'Your team' : 'Join'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
