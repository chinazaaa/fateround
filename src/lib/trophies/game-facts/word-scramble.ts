import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Word Scramble per-game facts, derived at finish from `word_scramble_solves` and
 * `word_scramble_hints`.
 *
 * Each solved scramble is persisted with word, `via_hint`, and `solved_at`.
 * Hint usage comes from the separate `word_scramble_hints` table.
 */

type SolveRow = {
  player_id: string
  scramble_index: number
  word: string
  via_hint: boolean
}

export async function wordScrambleFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: solvesData }, { data: hintsData }, { data: roundData }] = await Promise.all([
    supabase.from('word_scramble_solves').select('player_id, scramble_index, word, via_hint').eq('game_id', gameId),
    supabase.from('word_scramble_hints').select('player_id, scramble_index').eq('game_id', gameId),
    supabase
      .from('rounds')
      .select('metadata')
      .eq('game_id', gameId)
      .order('round_number', { ascending: true })
      .limit(1),
  ])

  const solves = (solvesData ?? []) as SolveRow[]
  if (!solves.length) return out

  // Total scrambles in the puzzle from round metadata
  const meta = roundData?.[0]?.metadata as { count?: number } | null
  const totalScrambles = meta?.count ?? 0

  // Players who used hints (from hints table)
  const hintUsers = new Set((hintsData ?? []).map((h: { player_id: string }) => h.player_id))

  // Group by player
  const byPlayer = new Map<string, SolveRow[]>()
  for (const s of solves) {
    const list = byPlayer.get(s.player_id) ?? []
    list.push(s)
    byPlayer.set(s.player_id, list)
  }

  const seats = ctx.seated.length

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}
    const solved = rows.length

    // Lifetime tally
    if (solved > 0) facts.word_scramble_solves_total = solved

    // Per-game flags
    if (solved >= 5) facts.word_scramble_five_solved_games = 1
    if (solved >= 10) facts.word_scramble_ten_solved_games = 1

    // Long words
    if (rows.some((r) => r.word.length >= 7)) facts.word_scramble_long_word_solves = 1
    if (rows.some((r) => r.word.length >= 10)) facts.word_scramble_very_long_word_solves = 1

    // Themed
    if (ctx.theme) facts.word_scramble_themed_games = 1

    // Big room
    if (seats >= 10) facts.word_scramble_big_room_games = 1

    // Completion checks
    const usedHints = hintUsers.has(playerId) || rows.some((r) => r.via_hint)
    if (totalScrambles > 0 && solved >= totalScrambles) {
      facts.word_scramble_complete_games = 1
      if (!usedHints) {
        facts.word_scramble_no_hint_completions = 1
        facts.word_scramble_flawless_games = 1
      }
    }

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
