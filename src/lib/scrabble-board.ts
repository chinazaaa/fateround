// Pure Scrabble board logic — geometry, word extraction, and scoring.
// CLIENT-SAFE: no dictionary, no Supabase. Imported by both the UI (live score
// preview) and the server engine (src/lib/scrabble.ts). Dictionary validation and
// persistence live server-side in scrabble.ts.

import type { ScrabbleBoard, ScrabblePlacedTile, ScrabbleSession } from '@/types'
import {
  SCRABBLE_BOARD_SIZE as SIZE,
  SCRABBLE_CENTER,
  SCRABBLE_RACK_SIZE,
  SCRABBLE_BINGO_BONUS,
  scrabblePremiumAt,
} from './scrabble-constants'

/** Player id whose turn it is. Client-safe (no dictionary), used by UI and server. */
export function currentTurnPlayerId(session: Pick<ScrabbleSession, 'turn_order' | 'current_turn_index'>): string {
  return session.turn_order[session.current_turn_index] ?? session.turn_order[0]
}

/** Whether to show the results screen. Mirrors isChessResultsPhase. */
export function isScrabbleResultsPhase(
  gameStatus: string | undefined,
  session: Pick<ScrabbleSession, 'phase' | 'winner_player_id'> | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.phase === 'finished' || !!session.winner_player_id
}

export function emptyScrabbleBoard(): ScrabbleBoard {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null))
}

export function cloneScrabbleBoard(board: ScrabbleBoard): ScrabbleBoard {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function isBoardEmpty(board: ScrabbleBoard): boolean {
  for (const row of board) for (const cell of row) if (cell) return false
  return true
}

/** Point value of a single tile (blanks are always 0). Values are edition-specific. */
export function tileScore(letter: string, isBlank: boolean, values: Record<string, number>): number {
  return isBlank ? 0 : (values[letter.toUpperCase()] ?? 0)
}

/** Returns a copy of the board with the given tiles placed (letters upper-cased). */
export function withPlacedTiles(board: ScrabbleBoard, tiles: ScrabblePlacedTile[]): ScrabbleBoard {
  const next = cloneScrabbleBoard(board)
  for (const t of tiles) next[t.row][t.col] = { letter: t.letter.toUpperCase(), isBlank: t.isBlank }
  return next
}

const inBounds = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE

export interface PlacementGeometry {
  ok: boolean
  error?: string
  /** Orientation of the main word. 'single' when one tile (orientation inferred from neighbours). */
  axis?: 'row' | 'col' | 'single'
}

/**
 * Validates the geometry of a placement (NOT dictionary validity):
 * tiles in bounds, on empty cells, in a single line, contiguous (gaps filled by
 * existing tiles), and connected — first move covers the centre and is ≥2 letters;
 * later moves touch an existing tile.
 */
export function validatePlacementGeometry(board: ScrabbleBoard, tiles: ScrabblePlacedTile[]): PlacementGeometry {
  if (tiles.length === 0) return { ok: false, error: 'Place at least one tile' }
  if (tiles.length > SCRABBLE_RACK_SIZE) return { ok: false, error: 'Too many tiles' }

  const seen = new Set<string>()
  for (const t of tiles) {
    if (!inBounds(t.row, t.col)) return { ok: false, error: 'Tile off the board' }
    if (board[t.row][t.col]) return { ok: false, error: 'Square already occupied' }
    const key = `${t.row},${t.col}`
    if (seen.has(key)) return { ok: false, error: 'Two tiles on the same square' }
    seen.add(key)
  }

  const rows = new Set(tiles.map((t) => t.row))
  const cols = new Set(tiles.map((t) => t.col))
  const sameRow = rows.size === 1
  const sameCol = cols.size === 1
  if (!sameRow && !sameCol) return { ok: false, error: 'Tiles must be in a single row or column' }

  const axis: 'row' | 'col' | 'single' = tiles.length === 1 ? 'single' : sameRow ? 'row' : 'col'

  // Contiguity: along the placement line, every square between the min and max
  // placed coordinate must be filled (by a new or existing tile).
  const after = withPlacedTiles(board, tiles)
  if (sameRow) {
    const r = tiles[0].row
    const csList = tiles.map((t) => t.col)
    for (let c = Math.min(...csList); c <= Math.max(...csList); c++) {
      if (!after[r][c]) return { ok: false, error: 'Tiles must be contiguous' }
    }
  }
  if (sameCol) {
    const c = tiles[0].col
    const rsList = tiles.map((t) => t.row)
    for (let r = Math.min(...rsList); r <= Math.max(...rsList); r++) {
      if (!after[r][c]) return { ok: false, error: 'Tiles must be contiguous' }
    }
  }

  if (isBoardEmpty(board)) {
    if (!tiles.some((t) => t.row === SCRABBLE_CENTER.row && t.col === SCRABBLE_CENTER.col)) {
      return { ok: false, error: 'First word must cover the centre star' }
    }
    if (tiles.length < 2) return { ok: false, error: 'First word must be at least 2 letters' }
    return { ok: true, axis }
  }

  // Connectivity: at least one placed tile is orthogonally adjacent to an existing tile.
  const touches = tiles.some((t) =>
    [
      [t.row - 1, t.col],
      [t.row + 1, t.col],
      [t.row, t.col - 1],
      [t.row, t.col + 1],
    ].some(([r, c]) => inBounds(r, c) && board[r][c])
  )
  if (!touches) return { ok: false, error: 'New tiles must connect to existing tiles' }

  return { ok: true, axis }
}

export interface FormedWord {
  word: string
  cells: { row: number; col: number }[]
}

/** Walk a maximal run of filled cells through (row,col) along the given axis. */
function runThrough(board: ScrabbleBoard, row: number, col: number, axis: 'row' | 'col'): FormedWord {
  const dr = axis === 'col' ? 1 : 0
  const dc = axis === 'row' ? 1 : 0
  let r = row
  let c = col
  while (inBounds(r - dr, c - dc) && board[r - dr][c - dc]) {
    r -= dr
    c -= dc
  }
  const cells: { row: number; col: number }[] = []
  let word = ''
  while (inBounds(r, c) && board[r][c]) {
    cells.push({ row: r, col: c })
    word += board[r][c]!.letter
    r += dr
    c += dc
  }
  return { word, cells }
}

/**
 * All words formed by a placement: the main word along the placement axis plus any
 * perpendicular cross-words. Only runs of length ≥2 count. `board` is the board
 * BEFORE placement; the placed tiles are applied internally.
 */
export function extractWords(board: ScrabbleBoard, tiles: ScrabblePlacedTile[]): FormedWord[] {
  const after = withPlacedTiles(board, tiles)
  const out: FormedWord[] = []
  const seen = new Set<string>()
  const push = (w: FormedWord) => {
    if (w.word.length < 2) return
    const key = w.cells.map((p) => `${p.row},${p.col}`).join('|')
    if (seen.has(key)) return
    seen.add(key)
    out.push(w)
  }

  const sameRow = new Set(tiles.map((t) => t.row)).size === 1
  const mainAxis: 'row' | 'col' = tiles.length > 1 && !sameRow ? 'col' : 'row'

  // Main word (try both orientations for a single tile; dedupe handles overlap).
  push(runThrough(after, tiles[0].row, tiles[0].col, mainAxis))
  if (tiles.length === 1) push(runThrough(after, tiles[0].row, tiles[0].col, mainAxis === 'row' ? 'col' : 'row'))

  // Cross words: perpendicular run at each placed tile.
  const crossAxis: 'row' | 'col' = mainAxis === 'row' ? 'col' : 'row'
  for (const t of tiles) push(runThrough(after, t.row, t.col, crossAxis))

  return out
}

export interface PlacementScore {
  valid: boolean
  error?: string
  score: number
  words: string[]
}

/**
 * Full geometry + scoring for a placement (no dictionary check — that's server-side).
 * Premiums apply only to NEWLY placed tiles; word multipliers stack; a 7-tile play
 * earns the bingo bonus.
 */
export function scorePlacement(
  board: ScrabbleBoard,
  tiles: ScrabblePlacedTile[],
  values: Record<string, number>
): PlacementScore {
  const geo = validatePlacementGeometry(board, tiles)
  if (!geo.ok) return { valid: false, error: geo.error, score: 0, words: [] }

  const newCells = new Set(tiles.map((t) => `${t.row},${t.col}`))
  const blankCells = new Set(tiles.filter((t) => t.isBlank).map((t) => `${t.row},${t.col}`))
  const words = extractWords(board, tiles)
  if (words.length === 0) return { valid: false, error: 'No valid word formed', score: 0, words: [] }

  let total = 0
  for (const w of words) {
    let wordScore = 0
    let wordMult = 1
    for (const cell of w.cells) {
      const key = `${cell.row},${cell.col}`
      const isNew = newCells.has(key)
      const letterOnBoard = boardLetterAt(board, tiles, cell.row, cell.col)
      let letterScore = blankCells.has(key) ? 0 : (values[letterOnBoard] ?? 0)
      if (isNew) {
        const prem = scrabblePremiumAt(cell.row, cell.col)
        if (prem === 'DL') letterScore *= 2
        else if (prem === 'TL') letterScore *= 3
        else if (prem === 'DW') wordMult *= 2
        else if (prem === 'TW') wordMult *= 3
      }
      wordScore += letterScore
    }
    total += wordScore * wordMult
  }

  if (tiles.length === SCRABBLE_RACK_SIZE) total += SCRABBLE_BINGO_BONUS

  return { valid: true, score: total, words: words.map((w) => w.word) }
}

/** Resolved letter at a cell, considering tiles being placed this turn. */
function boardLetterAt(board: ScrabbleBoard, tiles: ScrabblePlacedTile[], row: number, col: number): string {
  const placed = tiles.find((t) => t.row === row && t.col === col)
  if (placed) return placed.letter.toUpperCase()
  return (board[row][col]?.letter ?? '').toUpperCase()
}
