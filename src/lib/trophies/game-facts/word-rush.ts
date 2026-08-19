import type { SupabaseClient } from '@supabase/supabase-js'
import type { FactsContext } from './index'

/**
 * Word Rush per-game facts, derived at finish from `word_rush_sessions`, `word_rush_players`,
 * and `word_rush_answers`.
 *
 * Two modes: team (rotating turns) and individual (all players answer each turn). Two prompt
 * modes: automatic and manual.
 */

type SessionRow = {
  mode: 'team' | 'individual'
  prompt_mode: 'automatic' | 'manual'
}

type AnswerRow = {
  player_id: string
  text: string
  correct: boolean
}

export async function wordRushFacts(
  supabase: SupabaseClient,
  gameId: string,
  _ctx: FactsContext
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>()

  const [{ data: sessionData }, { data: answersData }] = await Promise.all([
    supabase.from('word_rush_sessions').select('mode, prompt_mode').eq('game_id', gameId).maybeSingle(),
    supabase.from('word_rush_answers').select('player_id, text, correct').eq('game_id', gameId),
  ])

  if (!sessionData) return out
  const session = sessionData as SessionRow
  const answers = (answersData ?? []) as AnswerRow[]
  if (!answers.length) return out

  // Group by player
  const byPlayer = new Map<string, AnswerRow[]>()
  for (const a of answers) {
    const list = byPlayer.get(a.player_id) ?? []
    list.push(a)
    byPlayer.set(a.player_id, list)
  }

  for (const [playerId, rows] of byPlayer) {
    const facts: Record<string, number> = {}
    const correctCount = rows.filter((r) => r.correct).length
    const wrongCount = rows.filter((r) => !r.correct).length

    // Lifetime tally
    if (correctCount > 0) facts.word_rush_correct_answers = correctCount

    // Per-game flags
    if (correctCount >= 5) facts.word_rush_five_correct_games = 1
    if (correctCount >= 10) facts.word_rush_ten_correct_games = 1
    if (correctCount >= 20) facts.word_rush_twenty_correct_games = 1
    if (wrongCount === 0 && rows.length > 0) facts.word_rush_no_misses_games = 1

    // Long word (8+ letters)
    if (rows.some((r) => r.correct && r.text.length >= 8)) facts.word_rush_long_word_answers = 1

    // Mode flags
    if (session.mode === 'team') facts.word_rush_team_games = 1
    if (session.mode === 'individual') facts.word_rush_individual_games = 1
    if (session.prompt_mode === 'manual') facts.word_rush_manual_games = 1
    if (session.prompt_mode === 'automatic') facts.word_rush_auto_games = 1

    if (Object.keys(facts).length) out.set(playerId, facts)
  }

  return out
}
