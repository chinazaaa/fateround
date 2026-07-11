import type { GameType } from './types'

export const BATCH_4_GAMES: GameType[] = ['crazy_eights', 'whot', 'two_truths', 'describe_it']

export function batch4GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    crazy_eights: 'Crazy Eights',
    whot: 'Whot',
    two_truths: 'Two Truths & a Lie',
    describe_it: 'Describe It',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
