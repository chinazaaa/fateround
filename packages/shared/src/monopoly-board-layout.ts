import type { MonopolyColorGroup } from './monopoly-board'
import { MONOPOLY_BOARD_SIZE } from './monopoly-board'

export type MonopolyBoardEdge = 'bottom' | 'left' | 'top' | 'right' | 'corner'

export function boardEdgeForSpace(index: number): MonopolyBoardEdge {
  if (index === 0 || index === 10 || index === 20 || index === 30) return 'corner'
  if (index >= 1 && index <= 9) return 'bottom'
  if (index >= 11 && index <= 19) return 'left'
  if (index >= 21 && index <= 29) return 'top'
  return 'right'
}

/** Grid cell (1–11) for the 11×11 classic board layout. */
export function boardGridCell(index: number): { col: number; row: number } {
  if (index === 20) return { col: 1, row: 1 }
  if (index === 30) return { col: 11, row: 1 }
  if (index === 10) return { col: 1, row: 11 }
  if (index === 0) return { col: 11, row: 11 }
  if (index >= 21 && index <= 29) return { col: index - 19, row: 1 }
  if (index >= 11 && index <= 19) return { col: 1, row: 21 - index }
  if (index >= 31 && index <= 39) return { col: 11, row: index - 29 }
  if (index >= 1 && index <= 9) return { col: 11 - index, row: 11 }
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
  station: '#525252',
  utility: '#737373',
}

export function buildBoardSpaceGrid(): Map<string, number> {
  const map = new Map<string, number>()
  for (let index = 0; index < MONOPOLY_BOARD_SIZE; index += 1) {
    const { col, row } = boardGridCell(index)
    map.set(`${col},${row}`, index)
  }
  return map
}

export const BOARD_SPACE_GRID = buildBoardSpaceGrid()

export const MONOPOLY_GRID_SIZE = 11
