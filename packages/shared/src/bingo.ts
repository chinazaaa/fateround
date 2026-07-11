export const BINGO_COLUMNS = ['B', 'I', 'N', 'G', 'O'] as const
export type BingoColumn = (typeof BINGO_COLUMNS)[number]
export type BingoWinPattern = 'line' | 'full_house'

export const BINGO_MIN_PLAYERS = 2
export const BINGO_MAX_PLAYERS = 30
export const BINGO_DEFAULT_MAX_PLAYERS = 20
export const BINGO_FREE_INDEX = 12

const WINNING_LINES: number[][] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

export function columnForNumber(number: number): BingoColumn | null {
  if (number >= 1 && number <= 15) return 'B'
  if (number >= 16 && number <= 30) return 'I'
  if (number >= 31 && number <= 45) return 'N'
  if (number >= 46 && number <= 60) return 'G'
  if (number >= 61 && number <= 75) return 'O'
  return null
}

export function formatBingoNumber(number: number): string {
  const column = columnForNumber(number)
  return column ? `${column}-${number}` : String(number)
}

export function hasBingoWin(cells: number[], markedIndices: number[], pattern: BingoWinPattern = 'line'): boolean {
  const marked = new Set(markedIndices)
  if (pattern === 'full_house') {
    return cells.every((cell, index) => cell === 0 || marked.has(index))
  }
  return WINNING_LINES.some((line) => line.every((index) => cells[index] === 0 || marked.has(index)))
}

/** Column-major display order for 5×5 bingo cards. */
export const BINGO_DISPLAY_ORDER = Array.from({ length: 25 }, (_, pos) => (pos % 5) * 5 + Math.floor(pos / 5))
