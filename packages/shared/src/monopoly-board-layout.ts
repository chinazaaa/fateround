import type { MonopolyColorGroup } from './monopoly-board'
import { MONOPOLY_BOARD_SIZE, type MonopolyBoardSize } from './monopoly-board'

export type MonopolyBoardEdge = 'bottom' | 'left' | 'top' | 'right' | 'corner'

export function boardEdgeForSpace(
  index: number,
  boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE
): MonopolyBoardEdge {
  const sideLength = boardSize / 4
  if (index % sideLength === 0) return 'corner'
  if (index < sideLength) return 'bottom'
  if (index < sideLength * 2) return 'left'
  if (index < sideLength * 3) return 'top'
  return 'right'
}

export function monopolyGridSize(boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE): number {
  return boardSize / 4 + 1
}

/** Grid cell for the square perimeter corresponding to the selected board size. */
export function boardGridCell(
  index: number,
  boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE
): { col: number; row: number } {
  const sideLength = boardSize / 4
  const gridSize = monopolyGridSize(boardSize)
  if (index === sideLength * 2) return { col: 1, row: 1 }
  if (index === sideLength * 3) return { col: gridSize, row: 1 }
  if (index === sideLength) return { col: 1, row: gridSize }
  if (index === 0) return { col: gridSize, row: gridSize }
  if (index > sideLength * 2 && index < sideLength * 3) {
    return { col: index - sideLength * 2 + 1, row: 1 }
  }
  if (index > sideLength && index < sideLength * 2) {
    return { col: 1, row: sideLength * 2 + 1 - index }
  }
  if (index > sideLength * 3) {
    return { col: gridSize, row: index - sideLength * 3 + 1 }
  }
  if (index > 0 && index < sideLength) return { col: gridSize - index, row: gridSize }
  return { col: 1, row: 1 }
}

export function shortMonopolySpaceName(name: string, max = 8): string {
  if (name.length <= max) return name
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1 && parts[0]!.length <= max) return parts[0]!
  return `${name.slice(0, max - 1)}…`
}

export const MONOPOLY_COLOR_HEX: Record<MonopolyColorGroup, string> = {
  brown: '#92400e',
  light_blue: '#38bdf8',
  pink: '#f472b6',
  orange: '#f97316',
  red: '#dc2626',
  yellow: '#eab308',
  green: '#059669',
  dark_blue: '#1e40af',
  teal: '#0d9488',
  violet: '#7c3aed',
  indigo: '#4338ca',
  coral: '#f43f5e',
  station: '#525252',
  utility: '#737373',
}

export function buildBoardSpaceGrid(boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE): Map<string, number> {
  const map = new Map<string, number>()
  for (let index = 0; index < boardSize; index += 1) {
    const { col, row } = boardGridCell(index, boardSize)
    map.set(`${col},${row}`, index)
  }
  return map
}

export const BOARD_SPACE_GRID = buildBoardSpaceGrid()

export const MONOPOLY_GRID_SIZE = 11
