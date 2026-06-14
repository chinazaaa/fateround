import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateRoundsByGender, generateNRounds } from '@/lib/utils'
import {
  hasVotersForPolls,
  parseParticipantGenderFromDb,
  maxRecommendedRounds,
} from '@/lib/participants'
import {
  parseGameType,
  roundPoolSize,
  isWouldYouRather,
  isThisOrThat,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isCustomGame,
  isAnonymousMessagesGame,
} from '@/lib/game-types'
import { isGameGenderBased } from '@/lib/gender-based'
import { getCustomSlotCount } from '@/lib/custom-game'
import { buildHotSeatRoundRows } from '@/lib/hot-seat'
import { buildRoundsFromQuotePool, buildRoundsFromAnimePool, wstAutoRoundCount } from '@/lib/who-said-this'
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
import {
  combineLobbyQuestions,
  poolPickCountForLobby,
  lobbyAllowsPlayerQuestions,
  parsePlayerQuestionsOrder,
} from '@/lib/player-question-pool'
import { useFullHostListForRounds } from '@/lib/participant-mode'
import { buildPeoplePollParticipantPool } from '@/lib/player-participant-pool'
import { hostActionSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

import type { ParticipantForRounds } from '@/lib/utils'

/** Same-gender round groups for custom games with 4–5 slots. */
function generateGenderBasedNRounds(
  participants: ParticipantForRounds[],
  roundCount: number,
  poolSize: number
): string[][] {
  if (roundCount <= 0 || poolSize < 2) return []

  const byGender: Record<'male' | 'female', string[]> = { male: [], female: [] }
  for (const p of participants) {
    byGender[p.gender].push(p.id)
  }

  const eligible = (['male', 'female'] as const).filter((g) => byGender[g].length >= poolSize)
  if (eligible.length === 0) return []

  if (eligible.length === 1) {
    return generateNRounds(byGender[eligible[0]], roundCount, poolSize)
  }

  const maleCount = Math.ceil(roundCount / 2)
  const femaleCount = Math.floor(roundCount / 2)
  const maleGroups = generateNRounds(byGender.male, maleCount, poolSize)
  const femaleGroups = generateNRounds(byGender.female, femaleCount, poolSize)

  const result: string[][] = []
  let mi = 0
  let fi = 0
  const startWithMale = byGender.male.length >= byGender.female.length

  for (let r = 0; r < roundCount; r++) {
    const preferMale = startWithMale ? r % 2 === 0 : r % 2 === 1
    if (preferMale) {
      if (mi < maleGroups.length) result.push(maleGroups[mi++])
      else if (fi < femaleGroups.length) result.push(femaleGroups[fi++])
    } else {
      if (fi < femaleGroups.length) result.push(femaleGroups[fi++])
      else if (mi < maleGroups.length) result.push(maleGroups[mi++])
    }
  }

  return result
}

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

  if (isAnonymousMessagesGame(gameType)) {
    if (playersData.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 })
    }

    const { error: gameError } = await supabase
      .from('games')
      .update({
        status: 'active',
        current_round_number: 1,
        rounds_count: 1,
        session_started_at: now,
        anonymous_messages_trimmed_at: null,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isHotSeat(gameType)) {
    const { data: participantsData } = await supabase
      .from('participants')
      .select('id, name')
      .eq('game_id', code.toUpperCase())
      .order('display_order')

    const built = buildHotSeatRoundRows({
      gameId: code.toUpperCase(),
      players: playersData,
      participants: participantsData ?? [],
      participantMode: game.participant_mode,
      maxRoundsCap: game.rounds_count,
      now,
    })

    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const { roundRows, roundsCount } = built

    const { error: roundError } = await supabase.from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({
        status: 'active',
        current_round_number: 1,
        rounds_count: roundsCount,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (isWhoSaidThis(gameType)) {
    const wstQuoteSource = (game.wst_quote_source ?? 'player') as string

    const { data: participantsData } = await supabase
      .from('participants')
      .select('id')
      .eq('game_id', code.toUpperCase())
      .order('display_order')

    const participantIds = (participantsData ?? []).map((p) => p.id)

    let playerRoundRows: ReturnType<typeof buildRoundsFromQuotePool> = []
    let animeRoundRows: ReturnType<typeof buildRoundsFromAnimePool> = []

    if (wstQuoteSource === 'player' || wstQuoteSource === 'both') {
      if (wstQuoteSource === 'player') {
        if (participantIds.length < 2) {
          return NextResponse.json({ error: 'Need at least 2 names on the list' }, { status: 400 })
        }
        const submitters = playersData.filter((p) => p.participant_id)
        if (submitters.length < 2) {
          return NextResponse.json(
            {
              error: 'Need at least 2 players who claimed a name from the list',
            },
            { status: 400 }
          )
        }
      }

      const { data: poolEntries } = await supabase.from('wst_quote_pool').select('*').eq('game_id', code.toUpperCase())

      const quotes = poolEntries ?? []
      if (wstQuoteSource === 'player' && quotes.length < 2) {
        return NextResponse.json(
          {
            error: 'Need at least 2 quotes in the pool before starting — players submit quotes in the lobby',
          },
          { status: 400 }
        )
      }

      if (quotes.length > 0) {
        const count = wstAutoRoundCount(quotes.length)
        playerRoundRows = buildRoundsFromQuotePool({
          gameId: code.toUpperCase(),
          participantIds,
          poolEntries: quotes.slice(0, count),
          now,
        })
      }
    }

    if (wstQuoteSource === 'anime' || wstQuoteSource === 'both') {
      const { data: animePool } = await supabase
        .from('anime_quote_pool')
        .select('*')
        .eq('game_id', code.toUpperCase())
        .eq('removed', false)
        .order('created_at')

      const animeQuotes = animePool ?? []
      if (wstQuoteSource === 'anime' && animeQuotes.length < 2) {
        return NextResponse.json(
          {
            error: 'Need at least 2 anime quotes before starting — fetch quotes in the lobby',
          },
          { status: 400 }
        )
      }

      if (animeQuotes.length > 0) {
        animeRoundRows = buildRoundsFromAnimePool({
          gameId: code.toUpperCase(),
          participantIds,
          animeQuotes: animeQuotes.map((q) => ({
            quote_text: q.quote_text,
            anime_name: q.anime_name,
            correct_character: q.correct_character,
            choices: q.choices as string[],
          })),
          startIndex: playerRoundRows.length,
          now,
        })
      }
    }

    const allRoundRows = [...playerRoundRows, ...animeRoundRows]
    if (allRoundRows.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 total quotes to start' }, { status: 400 })
    }

    // Shuffle all rounds together, then re-number
    for (let i = allRoundRows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[allRoundRows[i], allRoundRows[j]] = [allRoundRows[j], allRoundRows[i]]
    }
    allRoundRows.forEach((r, i) => {
      r.round_number = i + 1
      r.status = i === 0 ? 'active' : 'pending'
      r.started_at = i === 0 ? now : null
      r.quote_submitted_at = i === 0 ? now : null
    })

    const { error: roundError } = await supabase.from('rounds').insert(allRoundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({
        status: 'active',
        current_round_number: 1,
        rounds_count: allRoundRows.length,
      })
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

    const playerQuestionsEnabled = lobbyAllowsPlayerQuestions(game)
    const questionOrder = parsePlayerQuestionsOrder(game.player_questions_order)
    const effectivePlayerCount = playerQuestionsEnabled ? playerMltQuestions.length : 0
    const basePoolCap = questionPoolCap(game, effectivePlayerCount)
    const totalAvailable = basePoolCap
    if (game.rounds_count > totalAvailable) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${totalAvailable} or fewer before starting` },
        { status: 400 }
      )
    }

    const useCustom = parseQuestionSource(game.question_source, gameType) === 'custom'
    const customPool = useCustom ? parseStoredMltQuestions(game.custom_questions) : []
    const poolNeeded = poolPickCountForLobby(
      game.rounds_count,
      effectivePlayerCount,
      questionOrder,
      playerQuestionsEnabled
    )
    const platformQuestions = useCustom
      ? pickCustomMltQuestions(customPool, poolNeeded)
      : pickMltQuestions(poolNeeded, await fetchMltQuestionUsage(supabase))
    const questions = combineLobbyQuestions(
      playerQuestionsEnabled ? playerMltQuestions : [],
      platformQuestions,
      game.rounds_count,
      playerQuestionsEnabled ? questionOrder : 'uploaded_first'
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

  if (isThisOrThat(gameType)) {
    const { data: playerWyrRows } = await supabase
      .from('player_questions')
      .select('option_a, option_b')
      .eq('game_id', code.toUpperCase())
      .eq('question_type', 'wyr')
    const playerTotQuestions = (playerWyrRows ?? [])
      .filter((q) => q.option_a?.trim() && q.option_b?.trim())
      .map((q) => ({ optionA: q.option_a!, optionB: q.option_b! }))
      .sort(() => Math.random() - 0.5)

    const playerQuestionsEnabled = lobbyAllowsPlayerQuestions(game)
    const questionOrder = parsePlayerQuestionsOrder(game.player_questions_order)
    const effectivePlayerCount = playerQuestionsEnabled ? playerTotQuestions.length : 0
    const customPool = parseStoredWyrQuestions(game.custom_questions)
    const totalAvailable = customPool.length + effectivePlayerCount
    if (totalAvailable === 0) {
      return NextResponse.json({ error: 'No questions available — upload prompts or wait for player submissions' }, { status: 400 })
    }
    if (game.rounds_count > totalAvailable) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${totalAvailable} or fewer before starting` },
        { status: 400 }
      )
    }

    const poolNeeded = poolPickCountForLobby(
      game.rounds_count,
      effectivePlayerCount,
      questionOrder,
      playerQuestionsEnabled
    )
    const poolQuestions = pickCustomWyrQuestions(customPool, poolNeeded)
    const questions = combineLobbyQuestions(
      playerQuestionsEnabled ? playerTotQuestions : [],
      poolQuestions,
      game.rounds_count,
      playerQuestionsEnabled ? questionOrder : 'uploaded_first'
    )
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

    const playerQuestionsEnabled = lobbyAllowsPlayerQuestions(game)
    const questionOrder = parsePlayerQuestionsOrder(game.player_questions_order)
    const effectivePlayerCount = playerQuestionsEnabled ? playerWyrQuestions.length : 0
    const basePoolCap = questionPoolCap(game, effectivePlayerCount)
    const totalAvailable = basePoolCap
    if (game.rounds_count > totalAvailable) {
      return NextResponse.json(
        { error: `Too many rounds — lower to ${totalAvailable} or fewer before starting` },
        { status: 400 }
      )
    }

    const useCustom = parseQuestionSource(game.question_source, gameType) === 'custom'
    const customPool = useCustom ? parseStoredWyrQuestions(game.custom_questions) : []
    const poolNeeded = poolPickCountForLobby(
      game.rounds_count,
      effectivePlayerCount,
      questionOrder,
      playerQuestionsEnabled
    )
    const platformQuestions = useCustom
      ? pickCustomWyrQuestions(customPool, poolNeeded)
      : pickWyrQuestions(poolNeeded, await fetchWyrQuestionUsage(supabase))
    const questions = combineLobbyQuestions(
      playerQuestionsEnabled ? playerWyrQuestions : [],
      platformQuestions,
      game.rounds_count,
      playerQuestionsEnabled ? questionOrder : 'uploaded_first'
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

  if (isCustomGame(gameType)) {
    const slotCount = getCustomSlotCount(game)
    if (slotCount < 2) {
      return NextResponse.json({ error: 'Custom game needs at least 2 slots configured' }, { status: 400 })
    }

    const { data: participantsData } = await supabase
      .from('participants')
      .select('id, gender, name, submitted_by_player_id')
      .eq('game_id', code.toUpperCase())
      .order('display_order')

    if (!participantsData || participantsData.length < slotCount) {
      return NextResponse.json(
        { error: `Need at least ${slotCount} names on the list (one per slot)` },
        { status: 400 }
      )
    }

    const roundPool = buildPeoplePollParticipantPool(game, participantsData, playersData)

    if (roundPool.length < slotCount) {
      return NextResponse.json({ error: `Need at least ${slotCount} people to join before starting` }, { status: 400 })
    }

    const participantIds = roundPool.map((p) => p.id)
    const genderBased = isGameGenderBased(game)
    let groups: string[][]

    if (genderBased) {
      const participants = roundPool.map((p) => ({
        id: p.id,
        gender: parseParticipantGenderFromDb(p.gender) ?? ('female' as const),
      }))
      groups =
        slotCount <= 3
          ? generateRoundsByGender(participants, game.rounds_count, slotCount as 2 | 3)
          : generateGenderBasedNRounds(participants, game.rounds_count, slotCount)

      if (groups.length === 0) {
        return NextResponse.json(
          { error: `Need at least ${slotCount} joined people of the same gender to start` },
          { status: 400 }
        )
      }

      const voterCheck = hasVotersForPolls(
        roundPool.map((p) => ({
          id: p.id,
          gender: parseParticipantGenderFromDb(p.gender) ?? ('female' as const),
        })),
        playersData
      )
      if (!voterCheck.ok) {
        return NextResponse.json({ error: voterCheck.message }, { status: 400 })
      }
    } else {
      groups = generateNRounds(participantIds, game.rounds_count, slotCount)
      if (groups.length === 0) {
        return NextResponse.json({ error: `Need at least ${slotCount} people to start` }, { status: 400 })
      }
    }

    const roundRows = groups.map((group, index) => ({
      game_id: code.toUpperCase(),
      round_number: index + 1,
      participant_ids: group,
      status: index === 0 ? 'active' : 'pending',
      started_at: index === 0 ? now : null,
      ended_at: null,
    }))

    const { error: roundError } = await supabase.from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await supabase
      .from('games')
      .update({ status: 'active', current_round_number: 1, rounds_count: groups.length })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  const poolSize = roundPoolSize(gameType)
  const minPool = poolSize

  const { data: participantsData } = await supabase
    .from('participants')
    .select('id, gender, name, submitted_by_player_id')
    .eq('game_id', code.toUpperCase())
    .order('display_order')

  const roundPool = buildPeoplePollParticipantPool(game, participantsData ?? [], playersData)

  if (roundPool.length < minPool) {
    const hostOnly = (participantsData ?? []).filter((p) => !p.submitted_by_player_id)
    const useAllHost = useFullHostListForRounds(game)
    const message =
      !useAllHost && hostOnly.length >= minPool
        ? `Need at least ${minPool} people to join before starting — only joined names appear in rounds`
        : `Need at least ${minPool} names on the list`
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const genderBased = isGameGenderBased(game)
  const participantInputs = roundPool.map((p) => ({
    name: p.name,
    gender: parseParticipantGenderFromDb(p.gender) ?? ('female' as const),
  }))

  const maxRounds = maxRecommendedRounds(participantInputs, gameType, genderBased, { game })
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

  let trios: string[][]
  if (genderBased) {
    trios = generateRoundsByGender(participants, game.rounds_count, poolSize)
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
  } else {
    trios = generateNRounds(
      participants.map((p) => p.id),
      game.rounds_count,
      poolSize
    )
    if (trios.length === 0) {
      return NextResponse.json({ error: `Need at least ${minPool} people to start` }, { status: 400 })
    }
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
