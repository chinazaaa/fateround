import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import { normalizeGender, hasEnoughForRounds, participantsNeedGender, type ParticipantInput } from '@/lib/participants'
import {
  parseGameType,
  roundPoolSize,
  isLobbyGame,
  isWouldYouRather,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isAnonymousGame,
  isPairGame,
  parsePairVoteMode,
} from '@/lib/game-types'
import { wstAutoRoundCount } from '@/lib/who-said-this'
import { clampHotSeatMaxCap, hotSeatMaxCapUpperBound, HOT_SEAT_MIN_PLAYERS } from '@/lib/hot-seat'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { parseQuestionSource, parseStoredWyrQuestions, parseStoredMltQuestions } from '@/lib/custom-questions'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import type { ParticipantMode, QuestionSource } from '@/types'
import { createGameSchema, stripHtml } from '@/lib/validation'
import { parseThemeId } from '@/lib/themes'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

function parseParticipants(raw: unknown, gameType: ReturnType<typeof parseGameType>): ParticipantInput[] | null {
  if (!Array.isArray(raw)) return null

  const parsed: ParticipantInput[] = []
  const needGender = participantsNeedGender(gameType)
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
  return parsed
}

function lobbyMaxRounds(
  gameType: ReturnType<typeof parseGameType>,
  questionSource: QuestionSource,
  customQuestions: unknown[] | null
): number {
  if (questionSource === 'custom') {
    if (isWouldYouRather(gameType)) return parseStoredWyrQuestions(customQuestions).length
    if (isMostLikelyTo(gameType)) return parseStoredMltQuestions(customQuestions).length
    return 20
  }
  if (isWouldYouRather(gameType)) return WYR_QUESTION_COUNT
  if (isMostLikelyTo(gameType)) return MLT_QUESTION_COUNT
  return 20
}

function parseCustomQuestionsBody(
  raw: unknown,
  gameType: ReturnType<typeof parseGameType>
): WyrQuestion[] | string[] | null {
  if (!Array.isArray(raw)) return null
  if (isWouldYouRather(gameType)) {
    const parsed = parseStoredWyrQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isMostLikelyTo(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  return null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createGameSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const {
    title,
    rounds_count,
    timer_seconds,
    anonymous,
    auto_reveal,
    auto_submit_behavior,
    participant_mode: rawMode,
    pair_vote_mode: rawPairVoteMode,
    question_source: rawQuestionSource,
    custom_questions: rawCustomQuestions,
    game_type: rawGameType,
    theme: rawTheme,
    participants: rawParticipants,
    participant_filter,
  } = parsed.data

  const game_type = parseGameType(rawGameType)
  const theme = parseThemeId(rawTheme)
  const question_source = parseQuestionSource(rawQuestionSource, game_type)
  let custom_questions: unknown[] | null = null

  if (question_source === 'custom' && (isWouldYouRather(game_type) || isMostLikelyTo(game_type))) {
    const cqParsed = parseCustomQuestionsBody(rawCustomQuestions, game_type)
    if (!cqParsed) {
      return NextResponse.json({ error: 'Upload at least one custom question' }, { status: 400 })
    }
    custom_questions = cqParsed
  }

  const participant_mode: ParticipantMode = isLobbyGame(game_type)
    ? 'joiners'
    : isWhoSaidThis(game_type) || isHotSeat(game_type)
      ? 'import'
      : rawMode === 'joiners'
        ? 'joiners'
        : 'import'

  let participants: ParticipantInput[] = []
  if (participant_mode === 'import') {
    const participantsParsed = parseParticipants(rawParticipants, game_type)
    if (!participantsParsed || participantsParsed.length < roundPoolSize(game_type)) {
      return NextResponse.json({ error: `At least ${roundPoolSize(game_type)} participants required` }, { status: 400 })
    }
    if (isMostLikelyTo(game_type)) {
      if (participantsParsed.length < 2) {
        return NextResponse.json({ error: 'Need at least 2 names on the list' }, { status: 400 })
      }
    } else if (isWhoSaidThis(game_type)) {
      if (participantsParsed.length < 2) {
        return NextResponse.json({ error: 'Need at least 2 names on the list' }, { status: 400 })
      }
    } else if (isHotSeat(game_type)) {
      if (participantsParsed.length < 3) {
        return NextResponse.json({ error: 'Need at least 3 names on the list for Hot Seat' }, { status: 400 })
      }
    } else if (!hasEnoughForRounds(participantsParsed, game_type)) {
      const min = roundPoolSize(game_type)
      return NextResponse.json(
        { error: `Need at least ${min} people of the same gender (male or female) for rounds` },
        { status: 400 }
      )
    }
    participants = participantsParsed
  }

  const maxRounds = lobbyMaxRounds(game_type, question_source, custom_questions)
  const roundsCount = isWhoSaidThis(game_type)
    ? wstAutoRoundCount(participants.length)
    : isHotSeat(game_type)
      ? clampHotSeatMaxCap(rounds_count ?? HOT_SEAT_MIN_PLAYERS, hotSeatMaxCapUpperBound(0, participants.length))
      : Math.min(Math.max(Number(rounds_count) || 3, 1), Math.min(maxRounds, 20))

  if (question_source === 'custom' && custom_questions && roundsCount > custom_questions.length) {
    return NextResponse.json(
      { error: `Need at least ${roundsCount} custom questions for ${roundsCount} rounds` },
      { status: 400 }
    )
  }

  if (question_source === 'custom' && custom_questions && custom_questions.length < 1) {
    return NextResponse.json({ error: 'Upload at least one custom question' }, { status: 400 })
  }

  let gameCode = generateGameCode()
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.from('games').select('id').eq('id', gameCode).maybeSingle()
    if (!data) break
    gameCode = generateGameCode()
  }

  const hostToken = generateToken()

  const { error: gameError } = await supabase.from('games').insert({
    id: gameCode,
    title,
    host_token: hostToken,
    rounds_count: roundsCount,
    timer_seconds: [15, 30, 60].includes(Number(timer_seconds)) ? Number(timer_seconds) : 30,
    anonymous: isAnonymousGame(game_type) ? true : anonymous !== false,
    auto_reveal: auto_reveal !== false,
    auto_submit_behavior: auto_submit_behavior === 'random' ? 'random' : 'no_answer',
    participant_mode,
    participant_filter:
      isHotSeat(game_type) ? 'joined' : participant_filter === 'joined' ? 'joined' : 'all',
    pair_vote_mode: isPairGame(game_type) ? parsePairVoteMode(rawPairVoteMode) : 'any',
    question_source: isWouldYouRather(game_type) || isMostLikelyTo(game_type) ? question_source : 'platform',
    custom_questions,
    game_type,
    theme,
    status: 'waiting',
    current_round_number: 0,
    wst_quote_source: parsed.data.wst_quote_source ?? 'player',
  })

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 })
  }

  if (participant_mode === 'import' && participants.length > 0) {
    const participantRows = participants.map((p, index) => ({
      game_id: gameCode,
      name: p.name,
      gender: p.gender,
      display_order: index,
    }))

    const { error: partError } = await supabase.from('participants').insert(participantRows)
    if (partError) {
      await supabase.from('games').delete().eq('id', gameCode)
      return NextResponse.json({ error: partError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ gameCode, hostToken })
}
