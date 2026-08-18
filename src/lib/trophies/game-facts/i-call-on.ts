import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * I Call On (NPAT) per-game facts, derived at finish from `npat_answers` and `npat_marks`.
 *
 * 5 categories per round. Per-category scores are stored on the answers row. Each answer can be
 * marked valid/void by peers.
 */

type AnswerRow = {
  round_id: string
  player_id: string
  name: string
  animal: string
  place: string
  thing: string
  food: string
  score_name: number | null
  score_animal: number | null
  score_place: number | null
  score_thing: number | null
  score_food: number | null
}

type MarkRow = {
  round_id: string
  marker_player_id: string
  target_player_id: string
  valid_name: boolean
  valid_animal: boolean
  valid_place: boolean
  valid_thing: boolean
  valid_food: boolean
}

const CATEGORIES = ['name', 'animal', 'place', 'thing', 'food'] as const
const UNIQUE_SCORE = 10

export async function iCallOnFacts(
  supabase: SupabaseClient,
  gameId: string,
  ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: answersData }, { data: marksData }, { data: roundsData }] = await Promise.all([
    supabase
      .from('npat_answers')
      .select(
        'round_id, player_id, name, animal, place, thing, food, score_name, score_animal, score_place, score_thing, score_food'
      )
      .eq('game_id', gameId),
    supabase
      .from('npat_marks')
      .select(
        'round_id, marker_player_id, target_player_id, valid_name, valid_animal, valid_place, valid_thing, valid_food'
      )
      .eq('game_id', gameId),
    supabase.from('rounds').select('id, metadata').eq('game_id', gameId),
  ])

  const answers = (answersData ?? []) as AnswerRow[]
  const marks = (marksData ?? []) as MarkRow[]
  if (!answers.length) return out

  const seats = ctx.seated.length

  // Identify caller rounds (from round metadata)
  const callerByRound = new Map<string, string>()
  for (const r of (roundsData ?? []) as { id: string; metadata: { picker_player_id?: string } | null }[]) {
    if (r.metadata?.picker_player_id) callerByRound.set(r.id, r.metadata.picker_player_id)
  }

  // Count marks given per player
  const marksPerPlayer = new Map<string, number>()
  for (const m of marks) {
    marksPerPlayer.set(m.marker_player_id, (marksPerPlayer.get(m.marker_player_id) ?? 0) + 1)
  }

  // Check if any answers were voided (target_player_id + category)
  const voidedByPlayer = new Map<string, boolean>()
  for (const m of marks) {
    const anyVoid = !m.valid_name || !m.valid_animal || !m.valid_place || !m.valid_thing || !m.valid_food
    if (anyVoid) voidedByPlayer.set(m.target_player_id, true)
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
    const roundCount = rows.length

    // Lifetime tallies
    if (roundCount > 0) facts.npat_rounds_played = roundCount

    // Per-game flags
    if (roundCount >= 3) facts.npat_three_rounds_games = 1
    if (roundCount >= 5) facts.npat_five_rounds_games = 1

    // Was this player a caller in any round?
    let callerCount = 0
    for (const [, callerId] of callerByRound) {
      if (callerId === playerId) callerCount++
    }
    if (callerCount > 0) facts.npat_times_as_caller = callerCount

    // Marks given
    const marksGiven = marksPerPlayer.get(playerId) ?? 0
    if (marksGiven > 0) facts.npat_marks_given = marksGiven

    // Per-round analysis
    let uniqueAnswerStreak = 0
    let maxUniqueStreak = 0
    let totalUniqueAnswers = 0

    for (const row of rows) {
      const scores = [row.score_name, row.score_animal, row.score_place, row.score_thing, row.score_food]
      const values = [row.name, row.animal, row.place, row.thing, row.food]

      // Count filled categories
      const filled = values.filter((v) => v.trim().length > 0).length
      if (filled >= 5) facts.npat_five_filled_rounds = (facts.npat_five_filled_rounds ?? 0) + 1

      // Count unique answers (score == 10)
      const uniqueInRound = scores.filter((s) => s === UNIQUE_SCORE).length
      if (uniqueInRound > 0) {
        totalUniqueAnswers += uniqueInRound
        uniqueAnswerStreak++
        maxUniqueStreak = Math.max(maxUniqueStreak, uniqueAnswerStreak)
      } else {
        uniqueAnswerStreak = 0
      }

      // Clean sweep: all 5 categories scored unique (10 points each)
      if (uniqueInRound === 5) facts.npat_clean_sweep_rounds = (facts.npat_clean_sweep_rounds ?? 0) + 1

      // Perfect fifty: total of all 5 scores == 50
      const roundTotal = scores.reduce<number>((sum, s) => sum + (s ?? 0), 0)
      if (roundTotal === 50) facts.npat_perfect_fifty_rounds = (facts.npat_perfect_fifty_rounds ?? 0) + 1
    }

    if (totalUniqueAnswers > 0) facts.npat_unique_answers = totalUniqueAnswers
    if (maxUniqueStreak >= 3) facts.npat_original_streak_3_games = 1

    // No voids: not voided in this game
    if (!voidedByPlayer.has(playerId) && roundCount > 0) facts.npat_no_voids_games = 1

    // Big room
    if (seats >= 8) facts.npat_big_room_games = 1

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
