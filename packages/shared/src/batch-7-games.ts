import type { GameType } from './types'

export const BATCH_7_GAMES: GameType[] = ['mafia', 'codewords']

export function batch7GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    mafia: 'Mafia',
    codewords: 'Codewords',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
