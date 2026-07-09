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
