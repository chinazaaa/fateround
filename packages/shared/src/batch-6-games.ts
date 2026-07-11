import type { GameType } from './types'

export const BATCH_6_GAMES: GameType[] = ['chess', 'scrabble']

export function batch6GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    chess: 'Chess',
    scrabble: 'Scrabble',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
