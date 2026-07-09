'use client'

import type { WordRushPlayerScore, WordRushTeamScore } from '@/lib/word-rush'
import { TEAM_EMOJI, teamLabel } from '@/lib/word-rush'

export function WordRushShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">{children}</div>
}

export function WordRushCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-card-bg)] p-4 ${className}`}>
      {children}
    </div>
  )
}

export function WordRushTeamBadge({ team }: { team: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-1 text-xs font-bold">
      <span>{TEAM_EMOJI[team - 1] ?? '⬜'}</span>
      {teamLabel(team)}
    </span>
  )
}

const TEAM_CHIP = [
  'border-red-400/40 bg-red-500/10',
  'border-blue-400/40 bg-blue-500/10',
  'border-green-400/40 bg-green-500/10',
  'border-yellow-400/40 bg-yellow-500/10',
] as const

/** Lobby roster grouped by team — host can move players; seated host/player can pick a team. */
export function WordRushTeamRoster({
  numTeams,
  teamRows,
  players,
  myPlayerId,
  onPick,
  picking,
  onMoveTeam,
  moving,
}: {
  numTeams: number
  teamRows: { player_id: string; team: number }[]
  players: Array<{ id: string; name: string }>
  myPlayerId?: string | null
  onPick?: (team: number) => void
  picking?: boolean
  onMoveTeam?: (playerId: string, team: number) => void
  moving?: boolean
}) {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const myTeam = teamRows.find((r) => r.player_id === myPlayerId)?.team ?? null

  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: numTeams }, (_, i) => {
        const team = i + 1
        const chip = TEAM_CHIP[(team - 1) % TEAM_CHIP.length]!
        const members = teamRows.filter((r) => r.team === team)
        const mine = myTeam === team
        return (
          <div key={team} className={`rounded-2xl border p-3 space-y-2 ${chip}`}>
            <div className="flex items-center justify-between">
              <WordRushTeamBadge team={team} />
              <span className="text-faint text-xs">{members.length}</span>
            </div>
            <ul className="space-y-1 min-h-[1.5rem]">
              {members.map((m) => (
                <li key={m.player_id} className="text-sm flex items-center gap-1">
                  <span className="truncate">{nameById.get(m.player_id) ?? 'Player'}</span>
                  {m.player_id === myPlayerId && <span className="text-faint text-[10px] shrink-0">(you)</span>}
                  {onMoveTeam && numTeams > 1 && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      {Array.from({ length: numTeams }, (_, j) => j + 1)
                        .filter((t) => t !== team)
                        .map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => onMoveTeam(m.player_id, t)}
                            disabled={moving}
                            title={`Move to ${teamLabel(t)}`}
                            className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-card-bg)] px-1.5 text-xs font-black disabled:opacity-50"
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
                    : 'border-[var(--border-strong)] hover:bg-orange-500/10',
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

export function WordRushScoreboard({ scores }: { scores: WordRushTeamScore[] }) {
  return (
    <div className="grid gap-2">
      {scores.map((s) => (
        <div
          key={s.team}
          className="flex items-center justify-between rounded-xl bg-[var(--surface-inset-bg)] px-3 py-2"
        >
          <WordRushTeamBadge team={s.team} />
          <span className="text-lg font-black tabular-nums">{s.score}</span>
        </div>
      ))}
    </div>
  )
}

export function WordRushPlayerScoreboard({ scores }: { scores: WordRushPlayerScore[] }) {
  return (
    <div className="space-y-2">
      {scores.map((s, i) => (
        <div key={s.id} className="flex items-center justify-between rounded-xl bg-[var(--surface-inset-bg)] px-3 py-2">
          <span className="text-sm font-semibold truncate">
            {i + 1}. {s.name}
          </span>
          <span className="text-lg font-black tabular-nums">{s.score}</span>
        </div>
      ))}
    </div>
  )
}

export function WordRushPromptDisplay({
  startLetter,
  endLetter,
}: {
  startLetter: string | null
  endLetter: string | null
}) {
  if (!startLetter || !endLetter) return null
  return (
    <div className="text-center space-y-1">
      <p className="text-faint text-sm">Starts with</p>
      <p className="text-5xl font-black tracking-tight">{startLetter.toUpperCase()}</p>
      <p className="text-faint text-sm pt-2">Ends with</p>
      <p className="text-5xl font-black tracking-tight">{endLetter.toUpperCase()}</p>
    </div>
  )
}

export function WordRushLoadingScreen() {
  return (
    <WordRushShell>
      <div className="flex min-h-dvh items-center justify-center text-faint">Loading Word Rush…</div>
    </WordRushShell>
  )
}
