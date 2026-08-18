import type { GameType } from './types'

export const BATCH_4_GAMES: GameType[] = ['crazy_eights', 'whot', 'uno', 'two_truths', 'describe_it']

export function batch4GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    crazy_eights: 'Crazy Eights',
    whot: 'Whot',
    uno: 'Match Up',
    two_truths: 'Two Truths & a Lie',
    describe_it: 'Text Charades',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}
