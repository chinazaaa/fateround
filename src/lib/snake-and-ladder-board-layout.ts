import { LADDERS, SNAKES } from '@/lib/snake-and-ladder'

export const GRID = 10

/** Grid position of a square (1–100) on a boustrophedon ("snake") board. */
export function cellToGrid(n: number): { col: number; rowFromTop: number } {
  const clamped = Math.min(100, Math.max(1, n))
  const rowFromBottom = Math.floor((clamped - 1) / GRID)
  const indexInRow = (clamped - 1) % GRID
  // Even rows (0-based, from bottom) run left→right; odd rows run right→left.
  const col = rowFromBottom % 2 === 0 ? indexInRow : GRID - 1 - indexInRow
  const rowFromTop = GRID - 1 - rowFromBottom
  return { col, rowFromTop }
}

/** Pixel centre of a square given a cell size, for drawing tokens and snake/ladder lines. */
export function cellCenter(n: number, cell: number): { x: number; y: number } {
  const { col, rowFromTop } = cellToGrid(n)
  return { x: col * cell + cell / 2, y: rowFromTop * cell + cell / 2 }
}

export const LADDER_ENTRIES = Object.entries(LADDERS).map(([from, to]) => ({ from: Number(from), to }))
export const SNAKE_ENTRIES = Object.entries(SNAKES).map(([from, to]) => ({ from: Number(from), to }))
