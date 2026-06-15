import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { playAgainSchema } from '@/lib/validation'
import { assertHostGameSettings } from '@/lib/game-admin'
import {
  applyCustomQuestionsUpdate,
  applyParticipantListUpdate,
  applyTriviaSettingsUpdate,
  canReplaceHostParticipantList,
  clampRoundsForPool,
  parseHostPoolCustomQuestions,
  parseHostPoolTriviaQuestions,
  parseHostPoolParticipants,
  replaceHostParticipantList,
} from '@/lib/host-pool-update'
import { parseGameType, isBinaryChoiceGame, isMostLikelyTo, isTriviaGame } from '@/lib/game-types'
import { isGameGenderBased } from '@/lib/gender-based'
import { parsePoolUsage } from '@/lib/pool-usage'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = playAgainSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    hostToken,
    custom_questions: rawCustomQuestions,
    participants: rawParticipants,
    question_source,
    trivia_category,
    timer_seconds,
    rounds_count,
  } = parsed.data

  const hasTriviaSettings =
    question_source !== undefined ||
    trivia_category !== undefined ||
    timer_seconds !== undefined ||
    rounds_count !== undefined ||
    rawCustomQuestions !== undefined

  if (rawCustomQuestions === undefined && rawParticipants === undefined && !hasTriviaSettings) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const auth = await assertHostGameSettings(supabase, code, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const game = auth.game!
  const gameType = parseGameType(game.game_type)
  const genderBased = isGameGenderBased(game)
  const gameUpdate: Record<string, unknown> = {}
  let nextGame = { ...game }
  let poolUsage = parsePoolUsage(game.pool_usage)

  if (isTriviaGame(gameType) && hasTriviaSettings) {
    let customQuestions = undefined
    if (rawCustomQuestions !== undefined) {
      const nextQuestions = parseHostPoolTriviaQuestions(rawCustomQuestions)
      if (!nextQuestions) {
        return NextResponse.json({ error: 'Upload at least one valid question' }, { status: 400 })
      }
      const effectiveRounds = rounds_count ?? game.rounds_count
      if (nextQuestions.length < effectiveRounds) {
        return NextResponse.json(
          { error: `Need at least ${effectiveRounds} questions for ${effectiveRounds} rounds` },
          { status: 400 }
        )
      }
      customQuestions = nextQuestions
    }

    const { gameUpdate: triviaUpdate, poolUsage: nextPoolUsage } = applyTriviaSettingsUpdate(
      game,
      {
        question_source,
        trivia_category,
        timer_seconds,
        rounds_count,
        custom_questions: customQuestions,
      },
      poolUsage
    )
    Object.assign(gameUpdate, triviaUpdate)
    poolUsage = nextPoolUsage
    nextGame = { ...nextGame, ...triviaUpdate } as typeof game
  } else if (rawCustomQuestions !== undefined) {
    const nextQuestions = parseHostPoolCustomQuestions(rawCustomQuestions, gameType)
    if (!nextQuestions) {
      return NextResponse.json({ error: 'Upload at least one valid question' }, { status: 400 })
    }
    const { gameUpdate: questionUpdate, poolUsage: nextPoolUsage } = applyCustomQuestionsUpdate(
      game,
      nextQuestions,
      poolUsage
    )
    Object.assign(gameUpdate, questionUpdate)
    poolUsage = nextPoolUsage
    nextGame = { ...nextGame, ...questionUpdate } as typeof game
  }

  if (rawParticipants !== undefined) {
    if (!canReplaceHostParticipantList(game)) {
      return NextResponse.json({ error: 'This game mode does not support replacing the name list' }, { status: 400 })
    }

    const nextParticipants = parseHostPoolParticipants(rawParticipants, gameType, genderBased)
    if (!nextParticipants) {
      return NextResponse.json({ error: 'Add at least one valid name' }, { status: 400 })
    }

    const { error: replaceError } = await replaceHostParticipantList(supabase, auth.id, nextParticipants)
    if (replaceError) return NextResponse.json({ error: replaceError }, { status: 500 })

    poolUsage = applyParticipantListUpdate(game, nextParticipants, poolUsage).poolUsage
    gameUpdate.pool_usage = poolUsage
    nextGame = { ...nextGame, pool_usage: poolUsage }
  }

  const isLobbyQuestions = isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType)
  if (isLobbyQuestions) {
    const questionType = isMostLikelyTo(gameType) ? 'mlt' : 'wyr'
    const { count } = await supabase
      .from('player_questions')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', auth.id)
      .eq('question_type', questionType)
    const clampedRounds = clampRoundsForPool(nextGame, count ?? 0)
    if (clampedRounds !== null) {
      gameUpdate.rounds_count = clampedRounds
    }
  }

  if (Object.keys(gameUpdate).length === 0) {
    return NextResponse.json({ success: true, game })
  }

  const { data: updated, error: gameError } = await supabase
    .from('games')
    .update(gameUpdate)
    .eq('id', auth.id)
    .select()
    .single()

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true, game: updated })
}
