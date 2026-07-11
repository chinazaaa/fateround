import type { GameStatus, QuickDrawGuessSession, QuickDrawPlayMode } from './types'
import {
  DESCRIBE_IT_TEAM_OPTIONS,
  TEAM_EMOJI,
  computeDescribeItScores,
  describeItIndividualLeaderboard,
  describeItWinningTeams,
  teamLabel,
} from './describe-it'

export const QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM = 4
export const QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL = 3

export { DESCRIBE_IT_TEAM_OPTIONS as QUICK_DRAW_GUESS_TEAM_OPTIONS, TEAM_EMOJI, teamLabel }
export { computeDescribeItScores as computeQuickDrawGuessScores }
export { describeItWinningTeams as quickDrawGuessWinningTeams }
export { describeItIndividualLeaderboard as quickDrawGuessIndividualLeaderboard }

export function clampQuickDrawPlayMode(value: unknown): QuickDrawPlayMode {
  return value === 'individual' ? 'individual' : 'team'
}

export function clampQuickDrawNumTeams(value: unknown): number {
  const n = Number(value)
  return (DESCRIBE_IT_TEAM_OPTIONS as readonly number[]).includes(n) ? n : 2
}

export function isQuickDrawGuessVariant(variant: unknown): boolean {
  return variant === 'guess'
}

export function isQuickDrawGuessResultsPhase(
  gameStatus: GameStatus | undefined,
  session: Pick<QuickDrawGuessSession, 'status' | 'phase'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || session.phase === 'finished'
}

export type { QuickDrawGuessSession, QuickDrawPlayMode }
