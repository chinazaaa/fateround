import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { parseGameType } from '@/lib/game-types'
import { parseQuestionSource, parseStoredTriviaQuestions, pickCustomTriviaQuestions } from '@/lib/custom-questions'
import { pickTriviaQuestions } from '@/lib/trivia-questions'
import { triviaCategoryFromGame, buildRoundsFromTriviaQuestions, triviaUsageFromQuestions } from '@/lib/trivia'
import { parsePoolUsage, poolUsageToMap } from '@/lib/pool-usage'

/**
 * Start a knockout round's group trivia game: pick the questions, build the round
 * rows, and flip the game active — the same setup the normal trivia start does,
 * but triggered server-side so the host never opens a dashboard. From there the
 * game auto-advances through its questions and finishes on its own.
 *
 * `pool_usage` is carried on the game so a later round doesn't repeat questions
 * (each round's game inherits usage when it's spawned).
 */
export async function startKnockoutRoundGame(supabase: SupabaseClient, gameId: string): Promise<{ error?: string }> {
  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return { error: 'Game not found' }
  // Idempotent: if it's already been started, there's nothing to do.
  if (game.status !== 'waiting') return {}

  const gameType = parseGameType(game.game_type)
  const questionSource = parseQuestionSource(game.question_source, gameType)
  const category = triviaCategoryFromGame(game)
  const roundsCount = game.rounds_count ?? 5
  const poolUsage = parsePoolUsage(game.pool_usage)
  const usage = poolUsageToMap(poolUsage.trivia as Record<string, number> | undefined)

  const useCustom = questionSource === 'custom'
  const customPool = parseStoredTriviaQuestions(game.custom_questions)
  const questions = useCustom
    ? pickCustomTriviaQuestions(customPool, roundsCount, usage)
    : pickTriviaQuestions(roundsCount, category, usage)
  if (questions.length === 0) return { error: 'No trivia questions available for this round' }

  const now = new Date().toISOString()
  const roundRows = buildRoundsFromTriviaQuestions({ gameId, questions, now })
  const { error: roundError } = await supabase.from('rounds').insert(roundRows)
  if (roundError) return { error: internalErrorMessage('tournament-knockout', roundError) }

  const updatedPoolUsage = {
    ...poolUsage,
    trivia: { ...(poolUsage.trivia ?? {}), ...triviaUsageFromQuestions(questions) },
  }

  const { error: gameError } = await supabase
    .from('games')
    .update({ status: 'active', session_started_at: now, current_round_number: 1, pool_usage: updatedPoolUsage })
    .eq('id', gameId)
  if (gameError) return { error: internalErrorMessage('tournament-knockout', gameError) }

  return {}
}
