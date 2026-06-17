import type { LudoColor } from '@/types'
import { START_POS } from '@/lib/ludo'

/** 52 outer-track cells on a 15×15 grid, clockwise from red start. */
export const LUDO_TRACK_COORDS: ReadonlyArray<readonly [number, number]> = [
  [6, 1],
  [6, 2],
  [6, 3],
  [6, 4],
  [6, 5],
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
  [1, 6],
  [1, 7],
  [1, 8],
  [1, 9],
  [1, 10],
  [1, 11],
  [1, 12],
  [2, 13],
  [3, 13],
  [4, 13],
  [5, 13],
  [6, 13],
  [7, 13],
  [8, 13],
  [9, 13],
  [10, 13],
  [11, 13],
  [12, 13],
  [13, 12],
  [13, 11],
  [13, 10],
  [13, 9],
  [13, 8],
  [13, 7],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 6],
  [7, 6],
  [6, 7],
  [6, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [7, 1],
  [8, 1],
  [9, 1],
  [10, 1],
  [11, 1],
  [12, 1],
  [5, 1],
]

export const TRACK_GRID: Record<number, { row: number; col: number }> = Object.fromEntries(
  LUDO_TRACK_COORDS.map(([row, col], index) => [index, { row, col }])
)

const TRACK_CELL_SET = new Set(LUDO_TRACK_COORDS.map(([r, c]) => `${r},${c}`))

export const HOME_GRID: Record<LudoColor, { row: number; col: number }[]> = {
  red: [
    { row: 6, col: 7 },
    { row: 5, col: 7 },
    { row: 4, col: 7 },
    { row: 3, col: 7 },
    { row: 2, col: 7 },
  ],
  green: [
    { row: 7, col: 6 },
    { row: 7, col: 5 },
    { row: 7, col: 4 },
    { row: 7, col: 3 },
    { row: 7, col: 2 },
  ],
  yellow: [
    { row: 8, col: 7 },
    { row: 9, col: 7 },
    { row: 10, col: 7 },
    { row: 11, col: 7 },
    { row: 12, col: 7 },
  ],
  blue: [
    { row: 7, col: 8 },
    { row: 7, col: 9 },
    { row: 7, col: 10 },
    { row: 7, col: 11 },
    { row: 7, col: 12 },
  ],
}

const HOME_CELL_MAP = new Map<string, LudoColor>()
for (const [color, cells] of Object.entries(HOME_GRID) as [LudoColor, { row: number; col: number }[]][]) {
  for (const cell of cells) {
    HOME_CELL_MAP.set(`${cell.row},${cell.col}`, color)
  }
}

export const BASE_SLOTS: Record<LudoColor, { row: number; col: number }[]> = {
  red: [
    { row: 2, col: 2 },
    { row: 2, col: 4 },
    { row: 4, col: 2 },
    { row: 4, col: 4 },
  ],
  green: [
    { row: 2, col: 10 },
    { row: 2, col: 12 },
    { row: 4, col: 10 },
    { row: 4, col: 12 },
  ],
  yellow: [
    { row: 10, col: 10 },
    { row: 10, col: 12 },
    { row: 12, col: 10 },
    { row: 12, col: 12 },
  ],
  blue: [
    { row: 10, col: 2 },
    { row: 10, col: 4 },
    { row: 12, col: 2 },
    { row: 12, col: 4 },
  ],
}

const START_CELL_MAP = new Map<string, LudoColor>()
for (const [color, pos] of Object.entries(START_POS) as [LudoColor, number][]) {
  const cell = TRACK_GRID[pos]
  if (cell) START_CELL_MAP.set(`${cell.row},${cell.col}`, color)
}

export type BoardCellKind =
  | 'void'
  | 'base'
  | 'track'
  | 'start'
  | 'home'
  | 'center'

export function baseColorAt(row: number, col: number): LudoColor | null {
  if (row >= 1 && row <= 5 && col >= 1 && col <= 5) return 'red'
  if (row >= 1 && row <= 5 && col >= 9 && col <= 13) return 'green'
  if (row >= 9 && row <= 13 && col >= 9 && col <= 13) return 'yellow'
  if (row >= 9 && row <= 13 && col >= 1 && col <= 5) return 'blue'
  return null
}

export function boardCellKind(row: number, col: number): { kind: BoardCellKind; color?: LudoColor } {
  const key = `${row},${col}`

  if (row >= 6 && row <= 8 && col >= 6 && col <= 8) {
    return { kind: 'center' }
  }

  const base = baseColorAt(row, col)
  if (base) return { kind: 'base', color: base }

  if (START_CELL_MAP.has(key)) {
    return { kind: 'start', color: START_CELL_MAP.get(key)! }
  }

  const home = HOME_CELL_MAP.get(key)
  if (home) return { kind: 'home', color: home }

  if (TRACK_CELL_SET.has(key)) return { kind: 'track' }

  return { kind: 'void' }
}

export function moveDestinationCell(
  color: LudoColor,
  to: { zone: string; pos: number }
): { row: number; col: number } | null {
  if (to.zone === 'track') return TRACK_GRID[to.pos] ?? null
  if (to.zone === 'home') return HOME_GRID[color][to.pos] ?? null
  if (to.zone === 'finished') return { row: 7, col: 7 }
  if (to.zone === 'base') return BASE_SLOTS[color][0] ?? null
  return null
}

export function pieceStatusLabel(piece: { zone: string; pos: number }): string {
  if (piece.zone === 'base') return 'In base'
  if (piece.zone === 'track') return `On path (space ${piece.pos + 1})`
  if (piece.zone === 'home') return `Home lane (${piece.pos + 1}/5)`
  if (piece.zone === 'finished') return 'Finished'
  return piece.zone
}
