import type { GameType } from './types'

export const BATCH_10_GAMES: GameType[] = ['checkers_international', 'checkers_nigeria']

export function batch10GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    checkers_international: 'Checkers: International',
    checkers_nigeria: 'Checkers: Nigeria',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
