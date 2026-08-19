import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Bingo per-game facts, derived at finish from `bingo_cards`, `bingo_claims`, and
 * `bingo_called_numbers`.
 *
 * Bingo is single-winner. Cards have 25 cells (5x5 grid, centre is free space = index 12).
 * Winning lines are the 12 possible lines (5 rows, 5 cols, 2 diagonals).
 */

type CardRow = {
  player_id: string
  cells: number[]
  marked_indices: number[]
}

type ClaimRow = {
  player_id: string
  pattern: 'line' | 'full_house'
  status: string
}

const BINGO_LINES = [
  // Rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // Columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // Diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

const DIAGONAL_LINES = [
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

const FREE_SPACE = 12

export async function bingoFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: cardsData }, { data: claimsData }, { data: calledData }] = await Promise.all([
    supabase.from('bingo_cards').select('player_id, cells, marked_indices').eq('game_id', gameId),
    supabase.from('bingo_claims').select('player_id, pattern, status').eq('game_id', gameId).eq('status', 'approved'),
    supabase.from('bingo_called_numbers').select('number').eq('game_id', gameId),
  ])

  const cards = (cardsData ?? []) as CardRow[]
  const claims = (claimsData ?? []) as ClaimRow[]
  const calledCount = (calledData ?? []).length
  if (!cards.length) return out

  const winners = new Set(ctx.winners)
  const winnerClaims = new Map<string, ClaimRow>()
  for (const c of claims) winnerClaims.set(c.player_id, c)

  const seats = ctx.seated.length

  for (const card of cards) {
    const facts: Record<string, number> = {}
    const marked = new Set(card.marked_indices)
    const marksCount = marked.size - (marked.has(FREE_SPACE) ? 1 : 0) // Exclude pre-marked free space

    // Lifetime tally: marks made (excluding free space)
    if (marksCount > 0) facts.bingo_marks_made = marksCount

    // Count completed lines
    let completedLines = 0
    let hasDiagonalWin = false
    let hasFreeSpaceInWinLine = false
    for (const line of BINGO_LINES) {
      if (line.every((i) => marked.has(i))) {
        completedLines++
        if (line.includes(FREE_SPACE)) hasFreeSpaceInWinLine = true
        if (DIAGONAL_LINES.some((d) => d === line)) hasDiagonalWin = true
      }
    }

    // Four in a row (4+ consecutive marks in any line)
    for (const line of BINGO_LINES) {
      const consecutive = line.filter((i) => marked.has(i)).length
      if (consecutive >= 4) {
        facts.bingo_four_in_row_games = 1
        break
      }
    }

    // Full column (any column fully marked)
    const columns = [
      [0, 5, 10, 15, 20],
      [1, 6, 11, 16, 21],
      [2, 7, 12, 17, 22],
      [3, 8, 13, 18, 23],
      [4, 9, 14, 19, 24],
    ]
    if (columns.some((col) => col.every((i) => marked.has(i)))) {
      facts.bingo_full_column_games = 1
    }

    // Big room
    if (seats >= 20) facts.bingo_big_room_games = 1

    // Win-gated facts
    const won = winners.has(card.player_id)
    const claim = winnerClaims.get(card.player_id)
    if (won && claim) {
      if (hasFreeSpaceInWinLine) facts.bingo_free_space_wins = 1
      if (hasDiagonalWin) facts.bingo_diagonal_wins = 1
      if (calledCount <= 20) facts.bingo_under_twenty_wins = 1
      if (calledCount <= 15) facts.bingo_under_fifteen_wins = 1
      if (completedLines >= 2) facts.bingo_double_line_wins = 1
      if (claim.pattern === 'full_house') facts.bingo_full_house_wins = 1
    }

    if (Object.keys(facts).length) out.set(card.player_id, facts)
  }

  return out
}
