import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Word Search per-game facts, derived at finish from `word_search_found`.
 *
 * Each found word is persisted with start/end positions, `via_hint`, and `found_at`.
 * Direction (diagonal, reverse) is derivable from the coordinates.
 */

type FoundRow = {
  player_id: string
  word: string
  start_row: number
  start_col: number
  end_row: number
  end_col: number
  via_hint: boolean
  found_at: string
}

function isDiagonal(r: FoundRow): boolean {
  return r.start_row !== r.end_row && r.start_col !== r.end_col
}

function isReverse(r: FoundRow): boolean {
  // Reverse = end is before start in reading order (left-to-right, top-to-bottom)
  return r.end_row < r.start_row || (r.end_row === r.start_row && r.end_col < r.start_col)
}

function wordLength(r: FoundRow): number {
  const dr = Math.abs(r.end_row - r.start_row)
  const dc = Math.abs(r.end_col - r.start_col)
  return Math.max(dr, dc) + 1
}

export async function wordSearchFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: foundData }, { data: roundData }] = await Promise.all([
    supabase
      .from('word_search_found')
      .select('player_id, word, start_row, start_col, end_row, end_col, via_hint, found_at')
      .eq('game_id', gameId),
    supabase
      .from('rounds')
      .select('started_at')
      .eq('game_id', gameId)
      .order('round_number', { ascending: true })
      .limit(1),
  ])

  const found = (foundData ?? []) as FoundRow[]
  if (!found.length) return out

  const roundStart = roundData?.[0]?.started_at ? new Date(roundData[0].started_at).getTime() : null

  // Total distinct words in the puzzle (across all players)
  const allWords = new Set(found.map((f) => f.word))
  const totalWords = allWords.size

  // Group by player
  const byPlayer = new Map<string, FoundRow[]>()
  for (const f of found) {
    const list = byPlayer.get(f.player_id) ?? []
    list.push(f)
    byPlayer.set(f.player_id, list)
  }

  const seats = ctx.seated.length

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}
    const wordsFound = rows.length

    // Lifetime tallies
    if (wordsFound > 0) facts.word_search_words_found = wordsFound

    // Per-game flags
    if (wordsFound >= 5) facts.word_search_five_found_games = 1
    if (wordsFound >= 10) facts.word_search_ten_found_games = 1

    // Diagonal and reverse finds
    if (rows.some(isDiagonal)) facts.word_search_diagonal_finds = 1
    if (rows.some(isReverse)) facts.word_search_reverse_finds = 1

    // Long word (8+ letters)
    if (rows.some((r) => wordLength(r) >= 8)) facts.word_search_long_word_finds = 1

    // Fast start: 3+ words in first 20 seconds
    if (roundStart) {
      const early = rows.filter((r) => new Date(r.found_at).getTime() - roundStart <= 20_000)
      if (early.length >= 3) facts.word_search_fast_start_games = 1
    }

    // Themed
    if (ctx.theme) facts.word_search_themed_games = 1

    // Big room
    if (seats >= 10) facts.word_search_big_room_games = 1

    // Full grid: found every word
    const playerWords = new Set(rows.map((r) => r.word))
    if (playerWords.size >= totalWords && totalWords > 0) {
      facts.word_search_full_grid_games = 1
      const usedHints = rows.some((r) => r.via_hint)
      if (!usedHints) facts.word_search_no_hint_completions = 1
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
