import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so players can do a Sudoku on their own (like Yahtzee), not just in a group.
export const SUDOKU_MIN_PLAYERS = 1
export const SUDOKU_MAX_PLAYERS = 20
export const SUDOKU_DEFAULT_DURATION = 900 // 15 minutes

/** Points by order of correct submission per cell: 1st=10, 2nd=6, 3rd=4, 4th+=2 */
export const SUDOKU_CELL_SCORING = [10, 6, 4, 2] as const
/** Penalty points for a wrong cell submission. */
export const SUDOKU_WRONG_PENALTY = -3

/** @deprecated Legacy block scoring */
export const SUDOKU_SCORING = [10, 6, 3, 1] as const

// ── Types ────────────────────────────────────────────────────────────────────

export interface SudokuMetadata {
  puzzle: number[][] // 9×9, 0 = empty cell
  // The solution is NEVER stored in round metadata that players can read — it lives
  // in the RLS-protected sudoku_solutions table. Only generateSudokuPuzzle returns it
  // (to be stored server-side); it is absent from anything a client loads.
  solution?: number[][] // 9×9, complete solution — server-only
}

export interface SudokuSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  block_index: number | null
  cell_row: number | null
  cell_col: number | null
  submitted_value: number | null
  is_correct: boolean
  points_awarded: number
  submitted_at: string
}

export interface SudokuPlayerScore {
  player_id: string
  name: string
  points: number
}

// ── Puzzle generation ─────────────────────────────────────────────────────────

function xorshift(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function isPlacementValid(grid: number[][], row: number, col: number, num: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === num) return false
    if (grid[i][col] === num) return false
  }
  const br = Math.floor(row / 3) * 3
  const bc = Math.floor(col / 3) * 3
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === num) return false
    }
  }
  return true
}

function fillGrid(grid: number[][], rng: () => number): boolean {
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9)
    const col = i % 9
    if (grid[row][col] !== 0) continue
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng)
    for (const n of nums) {
      if (isPlacementValid(grid, row, col, n)) {
        grid[row][col] = n
        if (fillGrid(grid, rng)) return true
        grid[row][col] = 0
      }
    }
    return false
  }
  return true
}

/** Returns 0, 1, or 2 — stops early once it hits the limit. */
function countSolutions(grid: number[][], limit: number): number {
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9)
    const col = i % 9
    if (grid[row][col] !== 0) continue
    let count = 0
    for (let n = 1; n <= 9; n++) {
      if (isPlacementValid(grid, row, col, n)) {
        grid[row][col] = n
        count += countSolutions(grid, limit - count)
        grid[row][col] = 0
        if (count >= limit) return count
      }
    }
    return count
  }
  return 1 // no empty cells — complete solution found
}

/**
 * Generate a Sudoku puzzle with a unique solution.
 * `seed` drives deterministic puzzle generation per game session.
 * Aims for 36 given cells (45 removed).
 */
export function generateSudokuPuzzle(seed: number): { puzzle: number[][]; solution: number[][] } {
  const rng = xorshift(seed)
  const solution: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0))
  fillGrid(solution, rng)

  const puzzle = solution.map((r) => [...r])
  const positions = shuffle(
    Array.from({ length: 81 }, (_, i) => i),
    rng
  )

  for (const pos of positions) {
    const row = Math.floor(pos / 9)
    const col = pos % 9
    const backup = puzzle[row][col]
    puzzle[row][col] = 0

    const copy = puzzle.map((r) => [...r])
    if (countSolutions(copy, 2) !== 1) {
      puzzle[row][col] = backup // restore — removing this cell breaks uniqueness
    }

    const givenCount = puzzle.flat().filter((v) => v > 0).length
    if (givenCount <= 36) break
  }

  return { puzzle, solution }
}

export function parseSudokuMetadata(raw: unknown): SudokuMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  // Client metadata only carries the puzzle now; the solution is kept server-side.
  if (!Array.isArray(m.puzzle)) return null
  return m as unknown as SudokuMetadata
}

// ── Block helpers ─────────────────────────────────────────────────────────────

/** Returns the [row, col] pairs for the 9 cells in a 3×3 block (0-indexed 0–8). */
export function blockCells(blockIndex: number): [number, number][] {
  const br = Math.floor(blockIndex / 3) * 3
  const bc = (blockIndex % 3) * 3
  const cells: [number, number][] = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      cells.push([br + r, bc + c])
    }
  }
  return cells
}

/** blockIndex from (row, col). */
export function cellBlockIndex(row: number, col: number): number {
  return Math.floor(row / 3) * 3 + Math.floor(col / 3)
}

/**
 * Validate a 3×3 block submission against the full solution.
 * `submission` is row-major within the block (3×3 grid of numbers).
 */
export function validateBlock(submission: number[][], solution: number[][], blockIndex: number): boolean {
  const br = Math.floor(blockIndex / 3) * 3
  const bc = (blockIndex % 3) * 3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!submission[r]?.[c] || submission[r][c] !== solution[br + r][bc + c]) return false
    }
  }
  return true
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/** Points for being the `position`-th correct solver (0-indexed). Legacy block scoring. */
export function sudokuBlockPoints(position: number): number {
  return SUDOKU_SCORING[Math.min(position, SUDOKU_SCORING.length - 1)]
}

/** Points for being the `position`-th correct solver on a cell (0-indexed). */
export function sudokuCellPoints(position: number): number {
  return SUDOKU_CELL_SCORING[Math.min(position, SUDOKU_CELL_SCORING.length - 1)]
}

export function playerHasSolvedCell(
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>[],
  playerId: string,
  row: number,
  col: number
): boolean {
  return submissions.some((s) => s.player_id === playerId && s.cell_row === row && s.cell_col === col && s.is_correct)
}

export type SudokuUnitType = 'row' | 'col' | 'block'

export type SudokuUnitFlash = {
  type: SudokuUnitType
  index: number
}

function cellInUnit(row: number, col: number, type: SudokuUnitType, index: number): boolean {
  if (type === 'row') return row === index
  if (type === 'col') return col === index
  const br = Math.floor(index / 3) * 3
  const bc = (index % 3) * 3
  return row >= br && row < br + 3 && col >= bc && col < bc + 3
}

/** True when every non-given cell in the unit is correctly solved by this player. */
export function isPlayerUnitComplete(
  puzzle: number[][],
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>[],
  playerId: string,
  type: SudokuUnitType,
  index: number
): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (!cellInUnit(row, col, type, index)) continue
      if (puzzle[row]![col] !== 0) continue
      if (!playerHasSolvedCell(submissions, playerId, row, col)) return false
    }
  }
  return true
}

/** Units that became complete for this player with the solve at (solvedRow, solvedCol). */
export function getNewlyCompletedUnits(
  puzzle: number[][],
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>[],
  playerId: string,
  solvedRow: number,
  solvedCol: number
): SudokuUnitFlash[] {
  const before = submissions.filter(
    (s) => !(s.player_id === playerId && s.cell_row === solvedRow && s.cell_col === solvedCol && s.is_correct)
  )
  const after = playerHasSolvedCell(submissions, playerId, solvedRow, solvedCol)
    ? submissions
    : [...submissions, { player_id: playerId, cell_row: solvedRow, cell_col: solvedCol, is_correct: true }]

  const candidates: SudokuUnitFlash[] = [
    { type: 'row', index: solvedRow },
    { type: 'col', index: solvedCol },
    { type: 'block', index: cellBlockIndex(solvedRow, solvedCol) },
  ]

  return candidates.filter(
    (u) =>
      !isPlayerUnitComplete(puzzle, before, playerId, u.type, u.index) &&
      isPlayerUnitComplete(puzzle, after, playerId, u.type, u.index)
  )
}

export function isCellInFlashingUnits(row: number, col: number, units: SudokuUnitFlash[]): boolean {
  return units.some((u) => cellInUnit(row, col, u.type, u.index))
}

/** Green highlight for cells the current player has correctly solved. */
export const SUDOKU_MY_CELL_COLOR = '#86efac'

export function buildPlayerSolvedGrid(
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>[],
  playerId: string
): boolean[][] {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(false))
  for (const s of submissions) {
    if (s.player_id === playerId && s.is_correct && s.cell_row != null && s.cell_col != null) {
      grid[s.cell_row]![s.cell_col]! = true
    }
  }
  return grid
}

export function buildPlayerSolvedValueGrid(
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'submitted_value' | 'is_correct'>[],
  playerId: string
): number[][] {
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0))
  for (const s of submissions) {
    if (
      s.player_id === playerId &&
      s.is_correct &&
      s.cell_row != null &&
      s.cell_col != null &&
      s.submitted_value != null
    ) {
      grid[s.cell_row]![s.cell_col]! = s.submitted_value
    }
  }
  return grid
}

/**
 * Per-player board values: givens, your own correct answers, and local drafts only.
 * Other players' solutions are never shown — only their color (via getCellDisplayColor).
 */
export function buildPlayerDisplayGrid(
  puzzle: number[][],
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'submitted_value' | 'is_correct'>[],
  playerId: string,
  localDrafts: number[][]
): number[][] {
  const mySolved = buildPlayerSolvedGrid(submissions, playerId)
  const myValues = buildPlayerSolvedValueGrid(submissions, playerId)

  return puzzle.map((row, r) =>
    row.map((cell, c) => {
      if (cell !== 0) return cell
      if (mySolved[r]![c]) return myValues[r]![c] || localDrafts[r]?.[c] || 0
      return localDrafts[r]?.[c] || 0
    })
  )
}

/** Cell background color: green if I solved it, else first solver's color, else none. */
export function getCellDisplayColor(
  row: number,
  col: number,
  opts: {
    myPlayerId?: string | null
    mySolvedCells?: boolean[][]
    firstSolverId?: string | null
    playerColors?: Record<string, string>
  }
): string | undefined {
  const { myPlayerId, mySolvedCells, firstSolverId, playerColors = {} } = opts
  if (myPlayerId && mySolvedCells?.[row]?.[col]) return SUDOKU_MY_CELL_COLOR
  if (firstSolverId) return playerColors[firstSolverId] ?? SUDOKU_PLAYER_COLORS[0]
  return undefined
}

/** Distinct accent colors for up to 20 players (by join order). */
export const SUDOKU_PLAYER_COLORS = [
  '#86efac',
  '#93c5fd',
  '#fcd34d',
  '#f9a8d4',
  '#c4b5fd',
  '#fdba74',
  '#67e8f9',
  '#fca5a5',
  '#a3e635',
  '#e879f9',
  '#5eead4',
  '#fbbf24',
  '#fb7185',
  '#818cf8',
  '#4ade80',
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#facc15',
] as const

export function sudokuPlayerColor(index: number): string {
  return SUDOKU_PLAYER_COLORS[index % SUDOKU_PLAYER_COLORS.length]!
}

export type CellOwnerGrid = (string | null)[][]

/** First correct solver per cell wins ownership. */
export function buildCellOwnerGrid(
  submissions: Pick<
    SudokuSubmission,
    'player_id' | 'cell_row' | 'cell_col' | 'submitted_value' | 'is_correct' | 'submitted_at'
  >[]
): CellOwnerGrid {
  const owners: CellOwnerGrid = Array.from({ length: 9 }, () => Array(9).fill(null))
  const sorted = [...submissions]
    .filter((s) => s.is_correct && s.cell_row != null && s.cell_col != null)
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())

  for (const s of sorted) {
    const row = s.cell_row!
    const col = s.cell_col!
    if (!owners[row]![col]) owners[row]![col] = s.player_id
  }
  return owners
}

export function countEmptyCells(puzzle: number[][]): number {
  return puzzle.flat().filter((v) => v === 0).length
}

export function playerCompletionPercent(
  puzzle: number[][],
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>[],
  playerId: string
): number {
  const empty = countEmptyCells(puzzle)
  if (empty === 0) return 100
  const claimed = submissions.filter(
    (s) => s.player_id === playerId && s.is_correct && s.cell_row != null && s.cell_col != null
  ).length
  return Math.round((claimed / empty) * 100)
}

export function boardCompletionPercent(puzzle: number[][], cellOwners: CellOwnerGrid): number {
  const empty = countEmptyCells(puzzle)
  if (empty === 0) return 100
  let solved = 0
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (puzzle[r]![c] === 0 && cellOwners[r]![c]) solved++
    }
  }
  return Math.round((solved / empty) * 100)
}

/** Build a 9×9 display grid from puzzle givens + claimed cell values. */
export function buildClaimedValueGrid(
  puzzle: number[][],
  submissions: Pick<SudokuSubmission, 'cell_row' | 'cell_col' | 'submitted_value' | 'is_correct' | 'submitted_at'>[]
): number[][] {
  const grid = puzzle.map((r) => [...r])
  const sorted = [...submissions]
    .filter((s) => s.is_correct && s.cell_row != null && s.cell_col != null && s.submitted_value != null)
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())

  for (const s of sorted) {
    grid[s.cell_row!]![s.cell_col!] = s.submitted_value!
  }
  return grid
}

// ── Session data ──────────────────────────────────────────────────────────────

/**
 * Build the round row and the solution separately. The round's metadata holds only
 * the puzzle (client-readable); the solution must be written to the RLS-protected
 * sudoku_solutions table by the caller, never embedded in the round.
 */
export function buildSudokuRoundRow(gameId: string, seed: number) {
  const { puzzle, solution } = generateSudokuPuzzle(seed)
  return {
    roundRow: {
      game_id: gameId,
      round_number: 1,
      status: 'active' as const,
      started_at: new Date().toISOString(),
      participant_ids: [] as string[],
      sudoku_metadata: { puzzle },
    },
    solution,
  }
}

export async function clearSudokuSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['sudoku_submissions'])
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export function tallySudokuScores(
  submissions: Pick<SudokuSubmission, 'player_id' | 'points_awarded'>[],
  players: { id: string; name: string; spectator?: boolean | null }[]
): SudokuPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, number>()
  for (const p of activePlayers) totals.set(p.id, 0)

  for (const s of submissions) {
    const current = totals.get(s.player_id)
    if (current !== undefined) {
      totals.set(s.player_id, current + s.points_awarded)
    }
  }

  return activePlayers
    .map((p) => ({ player_id: p.id, name: p.name, points: totals.get(p.id) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
}
