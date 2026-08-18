import type { GameType } from './types'

export const BATCH_8_GAMES: GameType[] = ['monopoly', 'mahjong', 'quick_draw']

export function batch8GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    monopoly: 'Estate Kings',
    mahjong: 'Mahjong',
    quick_draw: 'Quick Draw',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
