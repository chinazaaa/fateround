import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateRoundsByGender } from '@/lib/utils'
import {
  hasVotersForPolls,
  parseParticipantGenderFromDb,
  participantsWhoJoined,
  maxRecommendedRounds,
} from '@/lib/participants'
import { parseGameType, roundPoolSize, isWouldYouRather, isMostLikelyTo, isWhoSaidThis } from '@/lib/game-types'
import { buildRoundsFromQuotePool, wstAutoRoundCount } from '@/lib/who-said-this'
import { pickWyrQuestions } from '@/lib/would-you-rather-questions'
import { pickMltQuestions } from '@/lib/most-likely-to-questions'
import { fetchMltQuestionUsage, fetchWyrQuestionUsage } from '@/lib/question-usage'
import {
  parseQuestionSource,
  parseStoredWyrQuestions,
  parseStoredMltQuestions,
  pickCustomWyrQuestions,
  pickCustomMltQuestions,
  questionPoolCap,
} from '@/lib/custom-questions'
import { hostActionSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = hostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken } = parsed.data

  const { data: game } = await supabase.from('games').select('*').eq('id', code.toUpperCase()).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 })

  const gameType = parseGameType(game.game_type)

  const { data: playersData } = await supabase
    .from('players')
    .select('id, gender, identity_gender, participant_id, name')
    .eq('game_id', code.toUpperCase())

  if (!playersData?.length) {
    return NextResponse.json({ error: 'Need at least one player to start' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (isWhoSaidThis(gameType)) {
    const { data: participantsData } = await supabase
      .from('participants')
      .select('id')
      .eq('game_id', code.toUpperCase())
      .order('display_order')

    if ((participantsData ?? []).length < 2) {
      return NextResponse.json({ error: 'Need at least 2 names on the list' }, { status: 400 })
    }

    const submitters = playersData.filter((p) => p.participant_id)
    if (submitters.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players who claimed a name from the list' }, { status: 400 })
    }

    const { data: poolEntries } = await supabase.from('wst_quote_pool').select('*').eq('game_id', code.toUpperCase())

    const quotes = poolEntries ?? []
    if (quotes.length < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 quotes in the pool before starting — players submit quotes in the lobby' },
        { status: 400 }
      )
    }

    const roundsCount = wstAutoRoundCount(quotes.length)
    const participantIds = (participantsData ?? []).map((p) => p.id)
    const roundRows = buildRoundsFromQuotePool({
      gameId: code.toUpperCase(),
      participantIds,
      poolEntries: quotes.slice(0, roundsCount),
      now,
    })

    const { error: roundError } = await supabase.from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'active', current_round_number: 1, rounds_count: roundsCount })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (isMostLikelyTo(gameType)) {
    const isImport = (game.participant_mode ?? 'import') === 'import'

    if (isImport) {
      const { data: participantsData } = await supabase
        .from('participants')
        .select('id')
        .eq('game_id', code.toUpperCase())

      if ((participantsData ?? []).length < 2) {
        return NextResponse.json(
          { error: 'Need at least 2 names on the imported list before starting' },
          { status: 400 }
        )
      }
      if (!playersData?.length) {
        return NextResponse.json({ error: 'Need at least one player joined to vote' }, { status: 400 })
      }
    } else if (playersData.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 })
    }

    // Fetch player-submitted MLT questions
    const { data: playerMltRows } = await supabase
      .from('player_questions')
      .select('question_text')
      .eq('game_id', code.toUpperCase())
      .eq('question_type', 'mlt')
    const playerMltQuestions = (playerMltRows ?? [])
      .map((q) => q.question_text)
      .filter((t): t is string => !!t?.trim())
      .sort(() => Math.random() - 0.5)

    const basePoolCap = questionPoolCap(game)
    const totalAvailable = basePoolCap + playerMltQuestions.length
    if (game.rounds_count > totalAvailable) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${totalAvailable} or fewer before starting` },
        { status: 400 }
      )
    }

    const useCustom = parseQuestionSource(game.question_source, gameType) === 'custom'
    const customPool = useCustom ? parseStoredMltQuestions(game.custom_questions) : []
    const platformNeeded = Math.max(0, game.rounds_count - playerMltQuestions.length)
    const platformQuestions = useCustom
      ? pickCustomMltQuestions(customPool, platformNeeded)
      : pickMltQuestions(platformNeeded, await fetchMltQuestionUsage(supabase))
    // Player questions first, then fill from platform/custom pool
    const questions = [...playerMltQuestions.slice(0, game.rounds_count), ...platformQuestions].slice(
      0,
      game.rounds_count
    )
    if (questions.length === 0) {
      return NextResponse.json(
        { error: useCustom ? 'No custom prompts available' : 'No prompts available' },
        { status: 400 }
      )
    }

    const roundRows = questions.map((question, index) => ({
      game_id: code.toUpperCase(),
      round_number: index + 1,
      participant_ids: [],
      mlt_question: question,
      status: index === 0 ? 'active' : 'pending',
      started_at: index === 0 ? now : null,
      ended_at: null,
    }))

    const { error: roundError } = await supabase.from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'active', current_round_number: 1 })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (isWouldYouRather(gameType)) {
    // Fetch player-submitted WYR questions
    const { data: playerWyrRows } = await supabase
      .from('player_questions')
      .select('option_a, option_b')
      .eq('game_id', code.toUpperCase())
      .eq('question_type', 'wyr')
    const playerWyrQuestions = (playerWyrRows ?? [])
      .filter((q) => q.option_a?.trim() && q.option_b?.trim())
      .map((q) => ({ optionA: q.option_a!, optionB: q.option_b! }))
      .sort(() => Math.random() - 0.5)

    const basePoolCap = questionPoolCap(game)
    const totalAvailable = basePoolCap + playerWyrQuestions.length
    if (game.rounds_count > totalAvailable) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${totalAvailable} or fewer before starting` },
        { status: 400 }
      )
    }

    const useCustom = parseQuestionSource(game.question_source, gameType) === 'custom'
    const customPool = useCustom ? parseStoredWyrQuestions(game.custom_questions) : []
    const platformNeeded = Math.max(0, game.rounds_count - playerWyrQuestions.length)
    const platformQuestions = useCustom
      ? pickCustomWyrQuestions(customPool, platformNeeded)
      : pickWyrQuestions(platformNeeded, await fetchWyrQuestionUsage(supabase))
    // Player questions first, then fill from platform/custom pool
    const questions = [...playerWyrQuestions.slice(0, game.rounds_count), ...platformQuestions].slice(
      0,
      game.rounds_count
    )
    if (questions.length === 0) {
      return NextResponse.json(
        { error: useCustom ? 'No custom questions available' : 'No questions available' },
        { status: 400 }
      )
    }

    const roundRows = questions.map((q, index) => ({
      game_id: code.toUpperCase(),
      round_number: index + 1,
      participant_ids: [],
      wyr_option_a: q.optionA,
      wyr_option_b: q.optionB,
      status: index === 0 ? 'active' : 'pending',
      started_at: index === 0 ? now : null,
      ended_at: null,
    }))

    const { error: roundError } = await supabase.from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'active', current_round_number: 1 })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  const poolSize = roundPoolSize(gameType)
  const minPool = poolSize

  const { data: participantsData } = await supabase
    .from('participants')
    .select('id, gender, name')
    .eq('game_id', code.toUpperCase())
    .order('display_order')

  if (!participantsData || participantsData.length < minPool) {
    return NextResponse.json({ error: `Need at least ${minPool} names on the list` }, { status: 400 })
  }

  const isImportMode = (game.participant_mode ?? 'import') === 'import'
  const roundPool = isImportMode ? participantsWhoJoined(participantsData, playersData) : participantsData

  if (roundPool.length < minPool) {
    return NextResponse.json(
      { error: `Need at least ${minPool} people to join before starting — only joined names appear in rounds` },
      { status: 400 }
    )
  }

  const participantInputs = roundPool.map((p) => ({
    name: p.name,
    gender: parseParticipantGenderFromDb(p.gender) ?? ('female' as const),
  }))

  const maxRounds = maxRecommendedRounds(participantInputs, gameType)
  if (game.rounds_count > maxRounds) {
    return NextResponse.json(
      {
        error: `Too many rounds for ${roundPool.length} players — lower to ${maxRounds} or fewer before starting`,
      },
      { status: 400 }
    )
  }

  const participants = roundPool.map((p) => ({
    id: p.id,
    gender: parseParticipantGenderFromDb(p.gender) ?? ('female' as const),
  }))

  const trios = generateRoundsByGender(participants, game.rounds_count, poolSize)
  if (trios.length === 0) {
    return NextResponse.json(
      { error: `Need at least ${minPool} joined people of the same gender to start` },
      { status: 400 }
    )
  }

  const voterCheck = hasVotersForPolls(participants, playersData)
  if (!voterCheck.ok) {
    return NextResponse.json({ error: voterCheck.message }, { status: 400 })
  }

  const roundRows = trios.map((trio, index) => ({
    game_id: code.toUpperCase(),
    round_number: index + 1,
    participant_ids: trio,
    status: index === 0 ? 'active' : 'pending',
    started_at: index === 0 ? now : null,
    ended_at: null,
  }))

  const { error: roundError } = await supabase.from('rounds').insert(roundRows)
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

  const { error: gameError } = await supabase
    .from('games')
    .update({ status: 'active', current_round_number: 1 })
    .eq('id', code.toUpperCase())

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
