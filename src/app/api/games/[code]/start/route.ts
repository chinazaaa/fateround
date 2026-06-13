import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateRoundsByGender } from '@/lib/utils'
import { hasVotersForPolls, parseParticipantGenderFromDb, participantsWhoJoined, maxRecommendedRounds } from '@/lib/participants'
import { parseGameType, roundPoolSize, isWouldYouRather, isMostLikelyTo } from '@/lib/game-types'
import { pickWyrQuestions } from '@/lib/would-you-rather-questions'
import { pickMltQuestions } from '@/lib/most-likely-to-questions'
import { fetchMltQuestionUsage, fetchWyrQuestionUsage } from '@/lib/question-usage'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { hostToken } = await req.json()

  const { data: game } = await supabase.from('games').select('*').eq('id', code.toUpperCase()).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 })

  const gameType = parseGameType(game.game_type)

  const { data: playersData } = await supabase
    .from('players')
    .select('gender, identity_gender, participant_id, name')
    .eq('game_id', code.toUpperCase())

  if (!playersData?.length) {
    return NextResponse.json({ error: 'Need at least one player to start' }, { status: 400 })
  }

  const now = new Date().toISOString()

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

    const maxRounds = maxRecommendedRounds([], gameType)
    if (game.rounds_count > maxRounds) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${maxRounds} or fewer before starting` },
        { status: 400 }
      )
    }

    const mltUsage = await fetchMltQuestionUsage(supabase)
    const questions = pickMltQuestions(game.rounds_count, mltUsage)
    if (questions.length === 0) {
      return NextResponse.json({ error: 'No prompts available' }, { status: 400 })
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
    const maxRounds = maxRecommendedRounds([], gameType)
    if (game.rounds_count > maxRounds) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${maxRounds} or fewer before starting` },
        { status: 400 }
      )
    }

    const wyrUsage = await fetchWyrQuestionUsage(supabase)
    const questions = pickWyrQuestions(game.rounds_count, wyrUsage)
    if (questions.length === 0) {
      return NextResponse.json({ error: 'No questions available' }, { status: 400 })
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
  const roundPool = isImportMode
    ? participantsWhoJoined(participantsData, playersData)
    : participantsData

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
