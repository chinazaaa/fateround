import type { DescribeItGuess, DescribeItMode, DescribeItSession, DescribeItWord } from './types'

export const DESCRIBE_IT_MIN_PLAYERS = 4
export const DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL = 3
export const DESCRIBE_IT_MAX_PLAYERS = 20
export const DESCRIBE_IT_DEFAULT_MAX_PLAYERS = 12
export const DESCRIBE_IT_TEAM_OPTIONS = [2, 3, 4] as const
export const DESCRIBE_IT_DEFAULT_TURN_SECONDS = 90
export const DESCRIBE_IT_DEFAULT_ROUNDS = 3

export function clampDescribeItMode(value: unknown): DescribeItMode {
  return value === 'individual' ? 'individual' : 'team'
}

export function clampDescribeItTeams(value: unknown): number {
  const n = Number(value)
  return (DESCRIBE_IT_TEAM_OPTIONS as readonly number[]).includes(n) ? n : 2
}

export const TEAM_NAMES = ['Team 1', 'Team 2', 'Team 3', 'Team 4'] as const
export const TEAM_EMOJI = ['🟦', '🟥', '🟩', '🟨'] as const

export function teamLabel(team: number): string {
  return TEAM_NAMES[team - 1] ?? `Team ${team}`
}

export type DescribeItTeamScore = { team: number; score: number }

export function computeDescribeItScores(
  words: Pick<DescribeItWord, 'team' | 'status'>[],
  numTeams: number
): DescribeItTeamScore[] {
  const counts = new Map<number, number>()
  for (let t = 1; t <= numTeams; t += 1) counts.set(t, 0)
  for (const w of words) {
    if (w.status === 'guessed') counts.set(w.team, (counts.get(w.team) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([team, score]) => ({ team, score }))
    .sort((a, b) => b.score - a.score || a.team - b.team)
}

export function describeItWinningTeams(scores: DescribeItTeamScore[]): number[] {
  if (scores.length === 0) return []
  const top = scores[0]!.score
  if (top === 0) return []
  return scores.filter((s) => s.score === top).map((s) => s.team)
}

export type DescribeItPlayerScore = { id: string; name: string; score: number }

export function describeItIndividualLeaderboard(
  playerRows: Array<{ player_id: string; score?: number | null }>,
  players: Array<{ id: string; name: string }>
): DescribeItPlayerScore[] {
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  return playerRows
    .map((r) => ({ id: r.player_id, name: nameById.get(r.player_id) ?? 'Player', score: r.score ?? 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export function isDescribeItResultsPhase(
  gameStatus: string | undefined,
  session: Pick<DescribeItSession, 'status' | 'phase'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || session.phase === 'finished'
}
