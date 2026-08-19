import type { GameType } from './types'

export const BATCH_3_GAMES: GameType[] = [
  'matching_pairs',
  'sudoku',
  'yahtzee',
  'snake_and_ladder',
  'ludo',
  'crossword',
  'word_search',
  'word_scramble',
  'word_grouping',
]

export function batch3GameLabel(gameType: GameType | string): string {
  const labels: Partial<Record<GameType, string>> = {
    matching_pairs: 'Matching Pairs',
    sudoku: 'Sudoku',
    yahtzee: 'Five Dice',
    snake_and_ladder: 'Snake & Ladder',
    ludo: 'Ludo',
    crossword: 'Crossword',
    word_search: 'Word Search',
    word_scramble: 'Word Scramble',
    word_grouping: 'Word Grouping',
  }
  return labels[gameType as GameType] ?? String(gameType).replace(/_/g, ' ')
}

export function pieceStatusLabel(piece: { zone: string; pos: number }): string {
  if (piece.zone === 'base') return 'In yard'
  if (piece.zone === 'finished') return 'Finished'
  if (piece.zone === 'home') return `Home ${piece.pos + 1}/5`
  return `Track ${piece.pos + 1}`
}
