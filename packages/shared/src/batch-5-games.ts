import type { GameType } from './types'

export const BATCH_5_GAMES: GameType[] = ['quiplash', 'word_rush', 'word_hunt', 'i_call_on']

export function batch5GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    quiplash: 'Quiplash',
    word_rush: 'Word Rush',
    word_hunt: 'Word Hunt',
    i_call_on: 'I Call On',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
