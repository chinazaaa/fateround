import type { GameType } from './types'

export const BATCH_3_GAMES: GameType[] = [
  'matching_pairs',
  'sudoku',
  'yahtzee',
  'snake_and_ladder',
  'ludo',
]

export function batch3GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    matching_pairs: 'Matching Pairs',
    sudoku: 'Sudoku',
    yahtzee: 'Yahtzee',
    snake_and_ladder: 'Snakes & Ladders',
    ludo: 'Ludo',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}

export function pieceStatusLabel(piece: { zone: string; pos: number }): string {
  if (piece.zone === 'base') return 'In yard'
  if (piece.zone === 'finished') return 'Finished'
  if (piece.zone === 'home') return `Home ${piece.pos + 1}/5`
  return `Track ${piece.pos + 1}`
}
