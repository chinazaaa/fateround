import type { SupabaseClient } from '@supabase/supabase-js'
import { stripHtml } from '@/lib/validation'
import {
  parseGameType,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isThisOrThat,
} from '@/lib/game-types'
import { usesHostParticipantList } from '@/lib/participant-mode'
import {
  normalizeGender,
  participantsNeedGenderForGame,
  type ParticipantInput,
} from '@/lib/participants'
import {
  parseStoredMltQuestions,
  parseStoredWyrQuestions,
  parseStoredTriviaQuestions,
  questionPoolCap,
} from '@/lib/custom-questions'
import { wyrQuestionKey } from '@/lib/would-you-rather-questions'
import { triviaQuestionKey } from '@/lib/trivia-questions'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import type { TriviaQuestion } from '@/types'
import type { Game } from '@/types'
import { parsePoolUsage, pruneParticipantUsage, pruneQuestionUsage } from '@/lib/pool-usage'
import { isGameGenderBased } from '@/lib/gender-based'
import { triviaCategoryFromGame, clampTriviaTimer } from '@/lib/trivia'
import { platformTriviaPool } from '@/lib/trivia-questions'

export function parseHostPoolParticipants(
  raw: unknown,
  gameType: ReturnType<typeof parseGameType>,
  genderBased: boolean
): ParticipantInput[] | null {
  if (!Array.isArray(raw)) return null

  const needGender = participantsNeedGenderForGame(gameType, { genderBased })
  const parsed: ParticipantInput[] = []

  for (const item of raw) {
    if (typeof item === 'string') {
      const name = stripHtml(item.trim())
      if (name) parsed.push({ name, gender: 'female' })
      continue
    }
    if (item && typeof item === 'object' && typeof item.name === 'string') {
      const name = stripHtml(item.name.trim())
      const gender = normalizeGender(String(item.gender ?? ''))
      if (name && gender) parsed.push({ name, gender })
      else if (name && !needGender) parsed.push({ name, gender: 'female' })
    }
  }

  return parsed.length > 0 ? parsed : null
}

export function parseHostPoolCustomQuestions(
  raw: unknown,
  gameType: ReturnType<typeof parseGameType>
): WyrQuestion[] | string[] | null {
  if (!Array.isArray(raw)) return null
  if (isBinaryChoiceGame(gameType) || isThisOrThat(gameType)) {
    const parsed = parseStoredWyrQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isMostLikelyTo(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  return null
}

export function parseHostPoolTriviaQuestions(raw: unknown): TriviaQuestion[] | null {
  if (!Array.isArray(raw)) return null
  const parsed = parseStoredTriviaQuestions(raw)
  return parsed.length > 0 ? parsed : null
}

export async function replaceHostParticipantList(
  supabase: SupabaseClient,
  gameId: string,
  nextParticipants: ParticipantInput[]
): Promise<{ error: string | null }> {
  const { data: hostParticipants } = await supabase
    .from('participants')
    .select('id')
    .eq('game_id', gameId)
    .is('submitted_by_player_id', null)

  const hostIds = (hostParticipants ?? []).map((p) => p.id)
  if (hostIds.length > 0) {
    await supabase.from('players').update({ participant_id: null }).eq('game_id', gameId).in('participant_id', hostIds)
    const { error: deleteHostPartsError } = await supabase
      .from('participants')
      .delete()
      .eq('game_id', gameId)
      .is('submitted_by_player_id', null)
    if (deleteHostPartsError) return { error: deleteHostPartsError.message }
  }

  const participantRows = nextParticipants.map((p, index) => ({
    game_id: gameId,
    name: p.name,
    gender: p.gender,
    display_order: index,
  }))
  const { error: insertPartsError } = await supabase.from('participants').insert(participantRows)
  if (insertPartsError) return { error: insertPartsError.message }

  return { error: null }
}

export function applyCustomQuestionsUpdate(
  game: Game,
  nextQuestions: WyrQuestion[] | string[],
  existingPoolUsage = parsePoolUsage(game.pool_usage)
): { gameUpdate: Record<string, unknown>; poolUsage: ReturnType<typeof parsePoolUsage> } {
  const gameType = parseGameType(game.game_type)
  let poolUsage = existingPoolUsage
  const gameUpdate: Record<string, unknown> = {
    custom_questions: nextQuestions,
  }

  if (isBinaryChoiceGame(gameType) || isThisOrThat(gameType)) {
    poolUsage = {
      ...poolUsage,
      wyr: pruneQuestionUsage(poolUsage.wyr, nextQuestions as WyrQuestion[], (q) =>
        wyrQuestionKey(q.optionA, q.optionB)
      ),
    }
  } else if (isMostLikelyTo(gameType)) {
    poolUsage = {
      ...poolUsage,
      mlt: pruneQuestionUsage(poolUsage.mlt, nextQuestions as string[], (q) => q),
    }
  }

  if (isThisOrThat(gameType)) {
    gameUpdate.question_source = 'custom'
  }

  gameUpdate.pool_usage = poolUsage
  return { gameUpdate, poolUsage }
}

export function applyTriviaCustomQuestionsUpdate(
  game: Game,
  nextQuestions: TriviaQuestion[],
  existingPoolUsage = parsePoolUsage(game.pool_usage)
): { gameUpdate: Record<string, unknown>; poolUsage: ReturnType<typeof parsePoolUsage> } {
  const poolUsage = {
    ...existingPoolUsage,
    trivia: pruneQuestionUsage(existingPoolUsage.trivia, nextQuestions, triviaQuestionKey),
  }
  return {
    gameUpdate: {
      custom_questions: nextQuestions,
      question_source: 'custom',
      pool_usage: poolUsage,
    },
    poolUsage,
  }
}

export type TriviaSettingsInput = {
  question_source?: 'platform' | 'custom'
  trivia_category?: 'tech' | 'general'
  timer_seconds?: number
  rounds_count?: number
  custom_questions?: TriviaQuestion[]
}

export function applyTriviaSettingsUpdate(
  game: Game,
  input: TriviaSettingsInput,
  existingPoolUsage = parsePoolUsage(game.pool_usage)
): { gameUpdate: Record<string, unknown>; poolUsage: ReturnType<typeof parsePoolUsage> } {
  const gameUpdate: Record<string, unknown> = {}
  let poolUsage = existingPoolUsage

  if (input.custom_questions !== undefined) {
    const { gameUpdate: questionUpdate, poolUsage: nextPoolUsage } = applyTriviaCustomQuestionsUpdate(
      game,
      input.custom_questions,
      poolUsage
    )
    Object.assign(gameUpdate, questionUpdate)
    poolUsage = nextPoolUsage
  }

  if (input.trivia_category !== undefined) gameUpdate.trivia_category = input.trivia_category
  if (input.timer_seconds !== undefined) gameUpdate.timer_seconds = clampTriviaTimer(input.timer_seconds)
  if (input.rounds_count !== undefined) gameUpdate.rounds_count = input.rounds_count

  if (input.question_source === 'platform') {
    gameUpdate.question_source = 'platform'
    if (input.custom_questions === undefined) {
      gameUpdate.custom_questions = null
    }
    const category =
      input.trivia_category ?? triviaCategoryFromGame({ trivia_category: game.trivia_category })
    poolUsage = {
      ...poolUsage,
      trivia: pruneQuestionUsage(poolUsage.trivia, platformTriviaPool(category), triviaQuestionKey),
    }
  } else if (input.question_source === 'custom') {
    gameUpdate.question_source = 'custom'
  }

  gameUpdate.pool_usage = poolUsage
  return { gameUpdate, poolUsage }
}

export function applyParticipantListUpdate(
  game: Game,
  nextParticipants: ParticipantInput[],
  existingPoolUsage = parsePoolUsage(game.pool_usage)
): { poolUsage: ReturnType<typeof parsePoolUsage> } {
  const poolUsage = {
    ...existingPoolUsage,
    participants: pruneParticipantUsage(existingPoolUsage.participants, nextParticipants),
  }
  return { poolUsage }
}

export function clampRoundsForPool(game: Game, playerQuestionCount = 0): number | null {
  const cap = questionPoolCap(game, playerQuestionCount)
  if (game.rounds_count > cap) return cap
  return null
}

export function canReplaceHostParticipantList(game: Pick<Game, 'participant_mode'>): boolean {
  return usesHostParticipantList(game.participant_mode)
}

export function hostPoolParticipantsNeedGender(game: Game): boolean {
  return participantsNeedGenderForGame(parseGameType(game.game_type), { game, genderBased: isGameGenderBased(game) })
}
