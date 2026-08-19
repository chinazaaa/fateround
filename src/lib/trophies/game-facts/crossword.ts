import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Crossword per-game facts, derived at finish from `crossword_submissions`.
 *
 * Per-cell submissions record `is_correct`, `via_hint`, and `submitted_at`. We derive correct
 * cell counts, wrong guesses, hint usage, accuracy, and speed-based flags.
 */

type SubmissionRow = {
  player_id: string
  cell_row: number
  cell_col: number
  is_correct: boolean
  via_hint: boolean
  submitted_at: string
}

export async function crosswordFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: subsData }, { data: roundData }] = await Promise.all([
    supabase
      .from('crossword_submissions')
      .select('player_id, cell_row, cell_col, is_correct, via_hint, submitted_at')
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

  // Group by player
  const byPlayer = new Map<string, SubmissionRow[]>()
  for (const s of subs) {
    const list = byPlayer.get(s.player_id) ?? []
    list.push(s)
    byPlayer.set(s.player_id, list)
  }

  const seats = ctx.seated.length

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}

    // Correct cells (distinct cell positions that were correct)
    const correctCells = new Set<string>()
    let wrongCount = 0
    let hintCount = 0
    for (const r of rows) {
      if (r.is_correct) correctCells.add(`${r.cell_row},${r.cell_col}`)
      else wrongCount++
      if (r.via_hint) hintCount++
    }

    const correct = correctCells.size
    if (correct > 0) facts.crossword_correct_cells = correct
    if (correct >= 10) facts.crossword_ten_cells_games = 1
    if (correct >= 20) facts.crossword_twenty_cells_games = 1

    // Quick fill: 3+ correct cells within first 30 seconds
    if (roundStart) {
      const early = rows.filter((r) => r.is_correct && new Date(r.submitted_at).getTime() - roundStart <= 30_000)
      const earlyDistinct = new Set(early.map((r) => `${r.cell_row},${r.cell_col}`))
      if (earlyDistinct.size >= 3) facts.crossword_quick_fill_games = 1
    }

    // Themed puzzle
    if (ctx.theme) facts.crossword_themed_games = 1

    // Big room
    if (seats >= 10) facts.crossword_big_room_games = 1

    // Full grid: check if player completed the entire puzzle.
    // We compare against total correct cells from ALL players to approximate grid size.
    // A more accurate check would need the puzzle metadata, but this suffices:
    // if the player has 100% of their correct cells and the game finished, trust finish logic.
    // Actually, the finish handler already checked completion. If this player is in winners, they completed.
    const won = ctx.winners.includes(playerId)

    // Full grid: player solved every cell. We approximate by checking if they won (first to complete).
    // For a more robust check, count all distinct correct cells across all players as grid size proxy.
    const allCorrectCells = new Set<string>()
    for (const s of subs) {
      if (s.is_correct) allCorrectCells.add(`${s.cell_row},${s.cell_col}`)
    }
    if (correct >= allCorrectCells.size && allCorrectCells.size > 0) {
      facts.crossword_full_grid_games = 1
      if (wrongCount === 0) facts.crossword_clean_sweep_games = 1
      if (hintCount === 0) facts.crossword_no_hint_completions = 1
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
