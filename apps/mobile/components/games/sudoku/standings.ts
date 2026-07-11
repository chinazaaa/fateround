import type { SudokuSubmission } from '@fateround/shared'

// Sudoku standings + cell-ownership helpers, mirrored from the web `@/lib/sudoku`.
// Kept colocated with the mobile Sudoku view so it can't collide with parallel agents
// editing shared lib files.

// Submissions returned by the mobile select may or may not carry `submitted_at`; the
// helpers below accept the optional field so ordering works once it's included.
type SubmissionLike = Pick<
  SudokuSubmission,
  'player_id' | 'cell_row' | 'cell_col' | 'submitted_value' | 'is_correct' | 'points_awarded'
> & { submitted_at?: string | null }

/** Green highlight for cells the current player has correctly solved. */
export const SUDOKU_MY_CELL_COLOR = '#86efac'

/** Distinct accent colors for up to 20 players (by join order). */
export const SUDOKU_PLAYER_COLORS = [
  '#c7d2fe',
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
export function buildCellOwnerGrid(submissions: SubmissionLike[]): CellOwnerGrid {
  const owners: CellOwnerGrid = Array.from({ length: 9 }, () => Array(9).fill(null))
  const correct = submissions.filter((s) => s.is_correct && s.cell_row != null && s.cell_col != null)
  // Order by submission time when available; otherwise keep the array's natural order
  // (the DB returns rows roughly chronologically) so the first solver still wins.
  const sorted = correct.every((s) => s.submitted_at)
    ? [...correct].sort(
        (a, b) => new Date(a.submitted_at as string).getTime() - new Date(b.submitted_at as string).getTime()
      )
    : correct

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
  submissions: SubmissionLike[],
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

export interface SudokuPlayerScore {
  player_id: string
  name: string
  points: number
}

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

/** Time spent by a player in seconds. If completed, stops at their final correct submission. */
export function getPlayerTimeSpent(
  game: { session_started_at?: string | null; finished_at?: string | null } | null,
  submissions: SubmissionLike[],
  playerId: string,
  completionPercent: number,
  nowMs: number,
  playerJoinedAt?: string | null
): number {
  if (!game?.session_started_at) return 0
  const sessionStartMs = new Date(game.session_started_at).getTime()
  const joinedMs = playerJoinedAt ? new Date(playerJoinedAt).getTime() : sessionStartMs
  const startMs = Number.isFinite(joinedMs) ? Math.max(sessionStartMs, joinedMs) : sessionStartMs
  if (completionPercent >= 100) {
    const myCorrect = submissions
      .filter(
        (s) =>
          s.player_id === playerId &&
          s.is_correct &&
          s.cell_row != null &&
          s.cell_col != null &&
          s.submitted_at
      )
      .sort(
        (a, b) => new Date(a.submitted_at as string).getTime() - new Date(b.submitted_at as string).getTime()
      )
    if (myCorrect.length > 0) {
      const lastCorrect = myCorrect[myCorrect.length - 1]!
      const endMs = new Date(lastCorrect.submitted_at as string).getTime()
      if (Number.isFinite(endMs)) return Math.max(0, Math.floor((endMs - startMs) / 1000))
    }
  }
  const endMs = completionPercent < 100 && game.finished_at ? new Date(game.finished_at).getTime() : nowMs
  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}

export function formatMinutesSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function ordinal(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return `${n}st`
  if (j === 2 && k !== 12) return `${n}nd`
  if (j === 3 && k !== 13) return `${n}rd`
  return `${n}th`
}
