import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so players can do a Sudoku on their own (like Yahtzee), not just in a group.
export const SUDOKU_MIN_PLAYERS = 1
export const SUDOKU_MAX_PLAYERS = 20
export const SUDOKU_DEFAULT_DURATION = 900 // 15 minutes

/** Points awarded by order of correct submission: 1st=10, 2nd=6, 3rd=3, 4th+=1 */
export const SUDOKU_SCORING = [10, 6, 3, 1] as const
/** Penalty points for a wrong block submission. */
export const SUDOKU_WRONG_PENALTY = -3

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
  block_index: number
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

/** Points for being the `position`-th correct solver (0-indexed). */
export function sudokuBlockPoints(position: number): number {
  return SUDOKU_SCORING[Math.min(position, SUDOKU_SCORING.length - 1)]
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
  const { error } = await supabase.from('sudoku_submissions').delete().eq('game_id', gameId)
  if (error) return { error: error.message }
  return { error: null }
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
