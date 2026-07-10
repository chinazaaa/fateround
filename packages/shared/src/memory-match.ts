import type { MatchingPairsGridSize, MatchingPairsMetadata } from './types'

export const MATCHING_PAIRS_FLIP_BACK_MS = 800
export const MATCHING_PAIRS_POINTS_PER_PAIR = 1000
export const MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY = 100
export const MATCHING_PAIRS_STREAK_BONUS = 500

export function parseMatchingPairsMetadata(raw: unknown): MatchingPairsMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.gridSizePairs !== 'number' || !Array.isArray(m.pairs) || !Array.isArray(m.playerBoards)) {
    return null
  }
  return m as unknown as MatchingPairsMetadata
}

export function getPlayerBoard(meta: MatchingPairsMetadata, playerId: string): number[] | null {
  const board = meta.playerBoards.find((b) => b.playerId === playerId)
  return board?.cardOrder ?? null
}

export function matchingPairsGridLayout(gridSizePairs: MatchingPairsGridSize): { cols: number; rows: number } {
  return gridSizePairs === 8 ? { cols: 4, rows: 4 } : { cols: 8, rows: 4 }
}

export function computeStreakBonus(streakBeforeMatch: number): number {
  const newStreak = streakBeforeMatch + 1
  return newStreak % 3 === 0 ? MATCHING_PAIRS_STREAK_BONUS : 0
}

export function pairIcon(meta: MatchingPairsMetadata, pairIndex: number): string {
  return meta.pairs.find((p) => p.pairIndex === pairIndex)?.icon ?? '?'
}

export function pairColor(meta: MatchingPairsMetadata, pairIndex: number): string {
  return meta.pairs.find((p) => p.pairIndex === pairIndex)?.color ?? '#64748b'
}
