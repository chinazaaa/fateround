import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Landmine per-game facts, derived at finish from `landmine_answers` and `landmine_marks`.
 *
 * Per-round answers with outcome enum (valid/original/void/mine/empty), mine_hit, is_original,
 * and points. Multi-round aggregation.
 */

type AnswerRow = {
  round_id: string
  player_id: string
  outcome: 'valid' | 'original' | 'void' | 'mine' | 'empty' | null
  mine_hit: boolean | null
  is_original: boolean | null
  points: number | null
}

type MarkRow = {
  marker_player_id: string
}

export async function landmineFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: answersData }, { data: marksData }] = await Promise.all([
    supabase
      .from('landmine_answers')
      .select('round_id, player_id, outcome, mine_hit, is_original, points')
      .eq('game_id', gameId),
    supabase.from('landmine_marks').select('marker_player_id').eq('game_id', gameId),
  ])

  const answers = (answersData ?? []) as AnswerRow[]
  const marks = (marksData ?? []) as MarkRow[]
  if (!answers.length) return out

  const seats = ctx.seated.length

  // Count marks given per player
  const marksPerPlayer = new Map<string, number>()
  for (const m of marks) {
    marksPerPlayer.set(m.marker_player_id, (marksPerPlayer.get(m.marker_player_id) ?? 0) + 1)
  }

  // Group answers by player
  const byPlayer = new Map<string, AnswerRow[]>()
  for (const a of answers) {
    const list = byPlayer.get(a.player_id) ?? []
    list.push(a)
    byPlayer.set(a.player_id, list)
  }

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}

    const totalAnswers = rows.filter((r) => r.outcome && r.outcome !== 'empty').length
    const mineHits = rows.filter((r) => r.mine_hit).length
    const safeRounds = rows.filter((r) => !r.mine_hit && r.outcome && r.outcome !== 'empty').length
    const originalAnswers = rows.filter((r) => r.is_original || r.outcome === 'original').length
    const voidedAnswers = rows.filter((r) => r.outcome === 'void').length
    const validAnswers = rows.filter((r) => r.outcome === 'valid' || r.outcome === 'original').length

    // Lifetime tallies
    if (totalAnswers > 0) facts.landmine_answers_total = totalAnswers
    if (safeRounds > 0) facts.landmine_safe_rounds = safeRounds
    if (mineHits > 0) facts.landmine_mine_hits = mineHits
    if (originalAnswers > 0) facts.landmine_original_answers = originalAnswers
    if (voidedAnswers > 0) facts.landmine_voided_answers = voidedAnswers

    // Marks given
    const marksGiven = marksPerPlayer.get(playerId) ?? 0
    if (marksGiven > 0) facts.landmine_marks_given = marksGiven

    // Per-game flags
    if (safeRounds >= 3) facts.landmine_three_clean_games = 1

    // Minesweeper: entire game without hitting the mine
    if (totalAnswers > 0 && mineHits === 0) facts.landmine_minesweeper_games = 1

    // Original thinker: 5+ rounds with original answer in one game
    if (originalAnswers >= 5) facts.landmine_original_thinker_games = 1

    // Perfect game: every answer valid (no void, no empty, no mine) AND at least one original
    const hasInvalid = rows.some((r) => r.outcome === 'void' || r.outcome === 'mine' || r.outcome === 'empty')
    if (!hasInvalid && originalAnswers >= 1 && totalAnswers > 0) {
      facts.landmine_perfect_games = 1
    }

    // Big room
    if (seats >= 8) facts.landmine_big_room_games = 1

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
