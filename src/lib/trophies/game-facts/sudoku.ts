import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Sudoku per-game facts, derived at finish from `sudoku_submissions`.
 *
 * Per-cell submissions record `is_correct`, `points_awarded`, `cell_row`, `cell_col`, and
 * `submitted_at`. We derive correct/wrong counts, accuracy, speed, and grid coverage.
 */

type SubmissionRow = {
  player_id: string
  cell_row: number | null
  cell_col: number | null
  is_correct: boolean
  points_awarded: number
  submitted_at: string
}

export async function sudokuFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: subsData }, { data: roundData }] = await Promise.all([
    supabase
      .from('sudoku_submissions')
      .select('player_id, cell_row, cell_col, is_correct, points_awarded, submitted_at')
      .eq('game_id', gameId),
    supabase
      .from('rounds')
      .select('started_at')
      .eq('game_id', gameId)
      .order('round_number', { ascending: true })
      .limit(1),
  ])

  const subs = (subsData ?? []) as SubmissionRow[]
  if (!subs.length) return out

  const roundStart = roundData?.[0]?.started_at ? new Date(roundData[0].started_at).getTime() : null

  // Total distinct correct cells across ALL players (proxy for open-cell count)
  const allCorrectCells = new Set<string>()
  for (const s of subs) {
    if (s.is_correct && s.cell_row != null && s.cell_col != null) {
      allCorrectCells.add(`${s.cell_row},${s.cell_col}`)
    }
  }
  const totalOpenCells = allCorrectCells.size

  // Group by player
  const byPlayer = new Map<string, SubmissionRow[]>()
  for (const s of subs) {
    const list = byPlayer.get(s.player_id) ?? []
    list.push(s)
    byPlayer.set(s.player_id, list)
  }

  const seats = ctx.seated.length
  const winners = new Set(ctx.winners)

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}

    const correctCells = new Set<string>()
    let wrongCount = 0
    let totalPoints = 0
    for (const r of rows) {
      if (r.is_correct && r.cell_row != null && r.cell_col != null) {
        correctCells.add(`${r.cell_row},${r.cell_col}`)
      }
      if (!r.is_correct) wrongCount++
      totalPoints += r.points_awarded
    }
    const correct = correctCells.size

    // Lifetime tallies
    if (correct > 0) facts.sudoku_correct_cells = correct

    // Per-game flags
    if (correct >= 10) facts.sudoku_ten_cells_games = 1
    if (correct >= 10 && wrongCount === 0) facts.sudoku_clean_ten_games = 1
    if (totalPoints >= 100) facts.sudoku_century_games = 1
    if (wrongCount === 0 && correct > 0) facts.sudoku_flawless_games = 1

    // Row master: all 9 cells in any single row
    const rowCounts = new Map<number, number>()
    for (const key of correctCells) {
      const row = parseInt(key.split(',')[0]!)
      rowCounts.set(row, (rowCounts.get(row) ?? 0) + 1)
    }
    if ([...rowCounts.values()].some((c) => c >= 9)) facts.sudoku_row_complete_games = 1

    // Box master: all 9 cells in any 3x3 box
    const boxCounts = new Map<string, number>()
    for (const key of correctCells) {
      const [r, c] = key.split(',').map(Number)
      const boxKey = `${Math.floor(r! / 3)},${Math.floor(c! / 3)}`
      boxCounts.set(boxKey, (boxCounts.get(boxKey) ?? 0) + 1)
    }
    if ([...boxCounts.values()].some((c) => c >= 9)) facts.sudoku_box_complete_games = 1

    // Speed solver: 5+ correct cells within 30 seconds
    if (roundStart) {
      const early = rows.filter((r) => r.is_correct && new Date(r.submitted_at).getTime() - roundStart <= 30_000)
      const earlyDistinct = new Set(early.filter((r) => r.cell_row != null).map((r) => `${r.cell_row},${r.cell_col}`))
      if (earlyDistinct.size >= 5) facts.sudoku_speed_solver_games = 1
    }

    // Half the grid
    if (totalOpenCells > 0 && correct >= Math.ceil(totalOpenCells / 2)) {
      facts.sudoku_half_grid_games = 1
    }

    // Big room
    if (seats >= 10) facts.sudoku_big_room_games = 1

    // Perfect race: win with 0 wrong
    if (winners.has(playerId) && wrongCount === 0) facts.sudoku_perfect_race_wins = 1

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
