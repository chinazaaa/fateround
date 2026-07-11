import type { SudokuMetadata, SudokuSubmission } from './types'

export function parseSudokuMetadata(raw: unknown): SudokuMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!Array.isArray(m.puzzle)) return null
  return m as unknown as SudokuMetadata
}

export function playerHasSolvedCell(
  submissions: Pick<SudokuSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>[],
  playerId: string,
  row: number,
  col: number
): boolean {
  return submissions.some((s) => s.player_id === playerId && s.cell_row === row && s.cell_col === col && s.is_correct)
}

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

function buildPlayerSolvedValueGrid(
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
