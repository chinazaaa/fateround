import type { LudoColor } from '@/types'
import { START_POS } from '@/lib/ludo'

/**
 * Standard 15×15 Ludo board (0-indexed rows/cols).
 * Corners: green TL · red TR · blue BR · yellow BL.
 * 52-cell outer track clockwise from green ★ at (6,1).
 */
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
  [0, 6],
  [0, 7],
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [6, 9],
  [6, 10],
  [6, 11],
  [6, 12],
  [6, 13],
  [6, 14],
  [7, 14],
  [8, 14],
  [8, 13],
  [8, 12],
  [8, 11],
  [8, 10],
  [8, 9],
  [9, 8],
  [10, 8],
  [11, 8],
  [12, 8],
  [13, 8],
  [14, 8],
  [14, 7],
  [14, 6],
  [13, 6],
  [12, 6],
  [11, 6],
  [10, 6],
  [9, 6],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
  [7, 0],
  [6, 0],
]

export const TRACK_GRID: Record<number, { row: number; col: number }> = Object.fromEntries(
  LUDO_TRACK_COORDS.map(([row, col], index) => [index, { row, col }])
)

/** Coloured home lanes — pos 0 is the cell where pieces enter from the track. */
export const HOME_GRID: Record<LudoColor, { row: number; col: number }[]> = {
  // green (TL) runs inward from the left edge along row 7
  green: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
  ],
  // red (TR) runs inward from the top edge along col 7
  red: [
    { row: 1, col: 7 },
    { row: 2, col: 7 },
    { row: 3, col: 7 },
    { row: 4, col: 7 },
    { row: 5, col: 7 },
  ],
  // blue (BR) runs inward from the right edge along row 7
  blue: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
  ],
  // yellow (BL) runs inward from the bottom edge along col 7 (pos 0 nearest the edge)
  yellow: [
    { row: 13, col: 7 },
    { row: 12, col: 7 },
    { row: 11, col: 7 },
    { row: 10, col: 7 },
    { row: 9, col: 7 },
  ],
}

/** ★ at each colour's spawn square on the outer track. */
export const START_CELL: Record<LudoColor, { row: number; col: number }> = {
  green: { row: 6, col: 1 },
  red: { row: 1, col: 8 },
  blue: { row: 8, col: 13 },
  yellow: { row: 13, col: 6 },
}

/**
 * ★ safe-star squares — the classic mid-arm stars, one per colour, sitting on
 * the track 8 squares clockwise from each start (which is also the last safe
 * square in front of that colour's home gate). Coloured to match the home the
 * square guards. These are the 4 non-start safe squares on a standard board.
 */
export const SAFE_STAR_CELL: Record<LudoColor, { row: number; col: number }> = {
  red: { row: 2, col: 6 }, // track idx 8 — in front of red's home (top)
  blue: { row: 6, col: 12 }, // track idx 21 — in front of blue's home (right)
  yellow: { row: 12, col: 8 }, // track idx 34 — in front of yellow's home (bottom)
  green: { row: 8, col: 2 }, // track idx 47 — in front of green's home (left)
}

/**
 * Visual home positions for the 4 pieces in each yard. Values are fractional
 * grid coordinates chosen so the 2×2 cluster is symmetric about the centre of
 * the 6×6 corner (the white yard square's centre), keeping the slots evenly
 * centred inside the yard. Purely a rendering concern.
 */
export const BASE_SLOTS: Record<LudoColor, { row: number; col: number }[]> = {
  // green — top-left corner
  green: [
    { row: 1.5, col: 1.5 },
    { row: 1.5, col: 3.5 },
    { row: 3.5, col: 1.5 },
    { row: 3.5, col: 3.5 },
  ],
  // red — top-right corner
  red: [
    { row: 1.5, col: 10.5 },
    { row: 1.5, col: 12.5 },
    { row: 3.5, col: 10.5 },
    { row: 3.5, col: 12.5 },
  ],
  // blue — bottom-right corner
  blue: [
    { row: 10.5, col: 10.5 },
    { row: 10.5, col: 12.5 },
    { row: 12.5, col: 10.5 },
    { row: 12.5, col: 12.5 },
  ],
  // yellow — bottom-left corner
  yellow: [
    { row: 10.5, col: 1.5 },
    { row: 10.5, col: 3.5 },
    { row: 12.5, col: 1.5 },
    { row: 12.5, col: 3.5 },
  ],
}

const TRACK_CELL_SET = new Set(LUDO_TRACK_COORDS.map(([r, c]) => `${r},${c}`))

const HOME_CELL_MAP = new Map<string, LudoColor>()
for (const [color, cells] of Object.entries(HOME_GRID) as [LudoColor, { row: number; col: number }[]][]) {
  for (const cell of cells) {
    HOME_CELL_MAP.set(`${cell.row},${cell.col}`, color)
  }
}

const START_CELL_MAP = new Map<string, LudoColor>()
for (const [color, cell] of Object.entries(START_CELL) as [LudoColor, { row: number; col: number }][]) {
  START_CELL_MAP.set(`${cell.row},${cell.col}`, color)
}

const SAFE_STAR_MAP = new Map<string, LudoColor>()
for (const [color, cell] of Object.entries(SAFE_STAR_CELL) as [LudoColor, { row: number; col: number }][]) {
  SAFE_STAR_MAP.set(`${cell.row},${cell.col}`, color)
}

/** Extra junction cells on the 3-wide cross (visual path, not separate track indices). */
const JUNCTION_CELLS = new Set(['6,6', '6,7', '6,8', '8,6', '8,8'])

export function baseColorAt(row: number, col: number): LudoColor | null {
  if (row >= 0 && row <= 5 && col >= 0 && col <= 5) return 'green'
  if (row >= 0 && row <= 5 && col >= 9 && col <= 14) return 'red'
  if (row >= 9 && row <= 14 && col >= 9 && col <= 14) return 'blue'
  if (row >= 9 && row <= 14 && col >= 0 && col <= 5) return 'yellow'
  return null
}

export type BoardCellKind = 'void' | 'base' | 'track' | 'start' | 'home' | 'center' | 'safe'

export function boardCellKind(row: number, col: number): { kind: BoardCellKind; color?: LudoColor } {
  const key = `${row},${col}`

  if (row === 7 && col === 7) {
    return { kind: 'center' }
  }

  if (row >= 6 && row <= 8 && col >= 6 && col <= 8 && !(row === 7 && col === 7)) {
    return { kind: 'center' }
  }

  if (START_CELL_MAP.has(key)) {
    return { kind: 'start', color: START_CELL_MAP.get(key)! }
  }

  if (SAFE_STAR_MAP.has(key)) {
    return { kind: 'safe', color: SAFE_STAR_MAP.get(key)! }
  }

  const home = HOME_CELL_MAP.get(key)
  if (home) return { kind: 'home', color: home }

  if (TRACK_CELL_SET.has(key) || JUNCTION_CELLS.has(key)) {
    return { kind: 'track' }
  }

  const base = baseColorAt(row, col)
  if (base) return { kind: 'base', color: base }

  return { kind: 'void' }
}

export function trackIndexForColor(color: LudoColor, stepsFromStart: number): number {
  return (START_POS[color] + stepsFromStart) % LUDO_TRACK_COORDS.length
}

export function trackCellsAlongSteps(
  color: LudoColor,
  stepsFromStart: number,
  dice: number
): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = []
  for (let step = 1; step <= dice; step += 1) {
    const nextSteps = stepsFromStart + step
    if (nextSteps >= LUDO_TRACK_COORDS.length) break
    const idx = trackIndexForColor(color, nextSteps)
    const cell = TRACK_GRID[idx]
    if (cell) cells.push(cell)
  }
  return cells
}

export function moveDestinationCell(
  color: LudoColor,
  to: { zone: string; pos: number }
): { row: number; col: number } | null {
  if (to.zone === 'track') return TRACK_GRID[to.pos] ?? null
  if (to.zone === 'home') return HOME_GRID[color][to.pos] ?? null
  if (to.zone === 'finished') return FINISHED_DISPLAY[color]
  if (to.zone === 'base') return BASE_SLOTS[color][to.pos] ?? BASE_SLOTS[color][0] ?? null
  return null
}

/** Where a finished piece sits in the centre — on the edge its home lane enters from. */
export const FINISHED_DISPLAY: Record<LudoColor, { row: number; col: number }> = {
  red: { row: 6, col: 7 }, // top — red home lane enters from the top
  green: { row: 7, col: 6 }, // left — green home lane enters from the left
  yellow: { row: 8, col: 7 }, // bottom — yellow home lane enters from the bottom
  blue: { row: 7, col: 8 }, // right — blue home lane enters from the right
}

export type TrackDirection = 'up' | 'down' | 'left' | 'right'

export const TRACK_DIRECTION: Record<number, TrackDirection> = Object.fromEntries(
  LUDO_TRACK_COORDS.map((coord, index) => {
    const next = LUDO_TRACK_COORDS[(index + 1) % LUDO_TRACK_COORDS.length]
    const [r, c] = coord
    const [nr, nc] = next
    if (nr < r) return [index, 'up']
    if (nr > r) return [index, 'down']
    if (nc < c) return [index, 'left']
    return [index, 'right']
  })
) as Record<number, TrackDirection>

const TRACK_POS_BY_COORD = new Map(LUDO_TRACK_COORDS.map((coord, index) => [`${coord[0]},${coord[1]}`, index]))

export function trackIndexAt(row: number, col: number): number | null {
  return TRACK_POS_BY_COORD.get(`${row},${col}`) ?? null
}

/** Track squares where a piece cannot be captured (★ start + mid-arm safe star). */
export const SAFE_TRACK_POSITIONS: ReadonlySet<number> = new Set(
  (['red', 'green', 'yellow', 'blue'] as LudoColor[]).flatMap((color) => {
    const indices: number[] = [START_POS[color]]
    const star = SAFE_STAR_CELL[color]
    const starIdx = trackIndexAt(star.row, star.col)
    if (starIdx != null) indices.push(starIdx)
    return indices
  })
)

/** Arrow direction on any visible path cell (including junction fillers). */
export function pathArrowAt(row: number, col: number): TrackDirection | null {
  const idx = trackIndexAt(row, col)
  if (idx != null) return TRACK_DIRECTION[idx] ?? null

  const key = `${row},${col}`
  if (!JUNCTION_CELLS.has(key)) return null

  if (key === '6,6') return 'up'
  if (key === '6,7') return 'right'
  if (key === '6,8') return 'right'
  if (key === '8,6') return 'left'
  if (key === '8,8') return 'up'
  return null
}

export const CORNER_BOUNDS: Record<LudoColor, { rowStart: number; rowEnd: number; colStart: number; colEnd: number }> =
  {
    green: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 },
    red: { rowStart: 0, rowEnd: 5, colStart: 9, colEnd: 14 },
    blue: { rowStart: 9, rowEnd: 14, colStart: 9, colEnd: 14 },
    yellow: { rowStart: 9, rowEnd: 14, colStart: 0, colEnd: 5 },
  }

export function pieceStatusLabel(piece: { zone: string; pos: number }): string {
  if (piece.zone === 'base') return 'At home'
  if (piece.zone === 'track') return `On path (space ${piece.pos + 1})`
  if (piece.zone === 'home') return `Home lane (${piece.pos + 1}/5)`
  if (piece.zone === 'finished') return 'In the center'
  return piece.zone
}
