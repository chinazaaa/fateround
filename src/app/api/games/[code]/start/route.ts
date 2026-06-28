import type { EliminationConfig } from '@/types/elimination'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateRoundsByGender, generateNRounds } from '@/lib/utils'
import { hasVotersForPolls, parseParticipantGenderFromDb, maxRecommendedRounds } from '@/lib/participants'
import {
  parseGameType,
  roundPoolSize,
  isWouldYouRather,
  isThisOrThat,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isWhoSaidThis,
  isHotSeat,
  isCustomGame,
  isAnonymousMessagesGame,
  isBingoGame,
  isCodewordsGame,
  isTriviaGame,
  isTwoTruthsGame,
  isMonopolyGame,
  isYahtzeeGame,
  isWhotGame,
  isCrazyEightsGame,
  isLudoGame,
  isTicTacToeGame,
  isChessGame,
  isDescribeItGame,
  isScrabbleGame,
  isICallOnGame,
  isSudokuGame,
  isWordHuntGame,
  isSnakeAndLadderGame,
} from '@/lib/game-types'
import { isGameGenderBased } from '@/lib/gender-based'
import { getCustomSlotCount } from '@/lib/custom-game'
import { buildHotSeatRoundRows } from '@/lib/hot-seat'
import { buildPickANumberRoundRows } from '@/lib/pick-a-number'
import { buildRoundsFromQuotePool, buildRoundsFromAnimePool, wstAutoRoundCount } from '@/lib/who-said-this'
import { pickWyrQuestions } from '@/lib/would-you-rather-questions'
import { pickMltQuestions } from '@/lib/most-likely-to-questions'
import { pickNhieQuestions } from '@/lib/never-have-i-ever-questions'
import { pickPanQuestions, PAN_DEFAULT_POOL_SIZE, PAN_MIN_POOL } from '@/lib/pick-a-number-questions'
import {
  fetchMltQuestionUsage,
  fetchNhieQuestionUsage,
  fetchPanQuestionUsage,
  fetchWyrQuestionUsage,
} from '@/lib/question-usage'
import {
  parseQuestionSource,
  parseStoredWyrQuestions,
  parseStoredMltQuestions,
  pickCustomWyrQuestions,
  pickCustomMltQuestions,
  pickCustomTriviaQuestions,
  questionPoolCap,
  parseStoredTriviaQuestions,
} from '@/lib/custom-questions'
import {
  combineLobbyQuestions,
  poolPickCountForLobby,
  lobbyAllowsPlayerQuestions,
  parsePlayerQuestionsOrder,
} from '@/lib/player-question-pool'
import { getFullHostListForRounds } from '@/lib/participant-mode'
import { buildPeoplePollParticipantPool } from '@/lib/player-participant-pool'
import { hostActionSchema } from '@/lib/validation'
import { ANONYMOUS_ROOM_MIN_PLAYERS } from '@/lib/anonymous-messages'
import { BINGO_MIN_PLAYERS, createBingoCardsForPlayers } from '@/lib/bingo'
import {
  TRIVIA_MIN_PLAYERS,
  buildRoundsFromTriviaQuestions,
  triviaCategoryFromGame,
  triviaUsageFromQuestions,
} from '@/lib/trivia'
import { pickTriviaQuestions } from '@/lib/trivia-questions'
import {
  CODEWORDS_MIN_PLAYERS,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  clampCodewordsTimer,
  generateKey,
  lobbyReady,
  lobbyReadyForGame,
  persistRandomizedRoles,
  pickBoardWords,
  teamsNeedRandomization,
  turnDeadline,
  codewordsWordPoolForGame,
  CODEWORDS_MIN_CUSTOM_POOL,
} from '@/lib/codewords'
import { buildTtlRoundRows, lobbyReadyForTwoTruths, shufflePlayerOrder, TTL_MIN_PLAYERS } from '@/lib/two-truths'
import { initializeMonopolyGame, MONOPOLY_MIN_PLAYERS } from '@/lib/monopoly'
import { initializeYahtzeeGame, YAHTZEE_MIN_PLAYERS } from '@/lib/yahtzee'
import { initializeWhotGame, WHOT_MIN_PLAYERS } from '@/lib/whot'
import { initializeCrazyEightsGame, CRAZY8_MIN_PLAYERS } from '@/lib/crazy-eights'
import { initializeLudoGame, LUDO_MIN_PLAYERS } from '@/lib/ludo'
import { initializeSnakeAndLadderGame, SNAKE_LADDER_MIN_PLAYERS } from '@/lib/snake-and-ladder'
import { initializeTicTacToeGame, TIC_TAC_TOE_MIN_PLAYERS } from '@/lib/tic-tac-toe'
import { initializeChessGame, CHESS_MIN_PLAYERS } from '@/lib/chess'
import {
  initializeDescribeItGame,
  DESCRIBE_IT_MIN_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
} from '@/lib/describe-it'
import { initializeScrabbleGame, SCRABBLE_MIN_PLAYERS, SCRABBLE_MAX_PLAYERS } from '@/lib/scrabble'
import { buildNpatInitialRound, NPAT_MIN_PLAYERS, shufflePlayerOrder as npatShufflePlayerOrder } from '@/lib/npat'
import { buildSudokuRoundRow, SUDOKU_MIN_PLAYERS } from '@/lib/sudoku'
import { buildWordHuntRoundRow, WORD_HUNT_MIN_PLAYERS } from '@/lib/word-hunt'
import { buildWordHuntMetadata } from '@/lib/word-hunt-dictionary'
import { appearanceCountsForParticipants, mergeUsageMaps, parsePoolUsage, poolUsageToMap } from '@/lib/pool-usage'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

import type { ParticipantForRounds } from '@/lib/utils'
import type { AiGeneratedQuestions, AiQuestionsConfig } from '@/types'

/** Same-gender round groups for custom games with 4–5 slots. */
function generateGenderBasedNRounds(
  participants: ParticipantForRounds[],
  roundCount: number,
  poolSize: number,
  initialAppearanceCounts?: Map<string, number>
): string[][] {
  if (roundCount <= 0 || poolSize < 2) return []

  const byGender: Record<'male' | 'female', string[]> = { male: [], female: [] }
  for (const p of participants) {
    byGender[p.gender].push(p.id)
  }

  const eligible = (['male', 'female'] as const).filter((g) => byGender[g].length >= poolSize)
  if (eligible.length === 0) return []

  if (eligible.length === 1) {
    return generateNRounds(byGender[eligible[0]], roundCount, poolSize, initialAppearanceCounts)
  }

  const maleCount = Math.ceil(roundCount / 2)
  const femaleCount = Math.floor(roundCount / 2)
  const maleGroups = generateNRounds(byGender.male, maleCount, poolSize, initialAppearanceCounts)
  const femaleGroups = generateNRounds(byGender.female, femaleCount, poolSize, initialAppearanceCounts)

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

function mergeAiIntoPlatformPool<T>(
  aiItems: T[],
  platformItems: T[],
  totalNeeded: number,
  ratio: AiQuestionsConfig['ratio']
): T[] {
  if (aiItems.length === 0) return platformItems.slice(0, totalNeeded)

  let aiCount: number
  switch (ratio) {
    case 'all_ai':
      aiCount = totalNeeded
      break
    case 'mostly_ai':
      aiCount = Math.ceil(totalNeeded * 0.75)
      break
    case 'half':
      aiCount = Math.ceil(totalNeeded * 0.5)
      break
    case 'mostly_platform':
      aiCount = Math.ceil(totalNeeded * 0.25)
      break
    default:
      aiCount = Math.ceil(totalNeeded * 0.5)
  }

  const actualAi = aiItems.slice(0, aiCount)
  const platformNeeded = totalNeeded - actualAi.length
  const actualPlatform = platformItems.slice(0, platformNeeded)

  const merged = [...actualAi, ...actualPlatform]
  for (let i = merged.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[merged[i], merged[j]] = [merged[j], merged[i]]
  }
  return merged
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = hostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken } = parsed.data

  const { data: game } = await getSupabaseAdmin().from('games').select('*').eq('id', code.toUpperCase()).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 })

  const gameType = parseGameType(game.game_type)
  const poolUsage = parsePoolUsage(game.pool_usage)
  const customWyrUsage = poolUsageToMap(poolUsage.wyr)
  const customMltUsage = poolUsageToMap(poolUsage.mlt)
  const hotSeatUsage = poolUsageToMap(poolUsage.hotSeat)

  const { data: playersData } = await supabase
    .from('players')
    .select('id, gender, identity_gender, participant_id, name, spectator')
    .eq('game_id', code.toUpperCase())

  if (!playersData?.length) {
    return NextResponse.json({ error: 'Need at least one player to start' }, { status: 400 })
  }

  const sessionStartedAt = new Date().toISOString()

  const now = sessionStartedAt

  if (isAnonymousMessagesGame(gameType)) {
    if (playersData.length < ANONYMOUS_ROOM_MIN_PLAYERS) {
      return NextResponse.json(
        { error: `Need at least ${ANONYMOUS_ROOM_MIN_PLAYERS} players to start` },
        { status: 400 }
      )
    }

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
        anonymous_messages_trimmed_at: null,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isTriviaGame(gameType)) {
    if (playersData.length < TRIVIA_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${TRIVIA_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const questionSource = parseQuestionSource(game.question_source, gameType)
    const category = triviaCategoryFromGame(game)
    const customPool = parseStoredTriviaQuestions(game.custom_questions)
    const useCustom = questionSource === 'custom'

    if (useCustom && customPool.length < game.rounds_count) {
      return NextResponse.json(
        { error: `Need at least ${game.rounds_count} custom questions — upload more or lower the round count` },
        { status: 400 }
      )
    }

    const triviaUsage = poolUsageToMap(poolUsage.trivia as Record<string, number> | undefined)
    const questions = useCustom
      ? pickCustomTriviaQuestions(customPool, game.rounds_count, triviaUsage)
      : pickTriviaQuestions(game.rounds_count, category, triviaUsage)

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No trivia questions available' }, { status: 400 })
    }

    const roundRows = buildRoundsFromTriviaQuestions({
      gameId: code.toUpperCase(),
      questions,
      now,
    })

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const updatedPoolUsage = {
      ...poolUsage,
      trivia: {
        ...(poolUsage.trivia ?? {}),
        ...triviaUsageFromQuestions(questions),
      },
    }

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        pool_usage: updatedPoolUsage,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    // Initialize lives for elimination mode
    if (game.elimination_config) {
      const elimConfig = game.elimination_config as EliminationConfig
      if (elimConfig.mode === 'lives' && elimConfig.startingLives) {
        await getSupabaseAdmin()
          .from('players')
          .update({ lives_remaining: elimConfig.startingLives })
          .eq('game_id', code.toUpperCase())
          .eq('spectator', false)
      }
    }

    return NextResponse.json({ success: true })
  }

  if (isBingoGame(gameType)) {
    if (playersData.length < BINGO_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${BINGO_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: cardsError } = await createBingoCardsForPlayers(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playersData.map((p) => p.id)
    )
    if (cardsError) return NextResponse.json({ error: cardsError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isMonopolyGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < MONOPOLY_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${MONOPOLY_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeMonopolyGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id),
      (game.timer_seconds ?? 0) as number
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isYahtzeeGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < YAHTZEE_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${YAHTZEE_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeYahtzeeGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isWhotGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < WHOT_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${WHOT_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeWhotGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCrazyEightsGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < CRAZY8_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${CRAZY8_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeCrazyEightsGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isLudoGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < LUDO_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${LUDO_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeLudoGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isSnakeAndLadderGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < SNAKE_LADDER_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${SNAKE_LADDER_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    // Snake & Ladder tables are RLS-locked to anon writes — initialize via the
    // service role. (Host authority is already enforced above for this route.)
    const { error: initError } = await initializeSnakeAndLadderGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isTicTacToeGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length !== TIC_TAC_TOE_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need exactly ${TIC_TAC_TOE_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    // Tic-Tac-Toe tables are RLS-locked to anon writes — initialize via the
    // service role. (Host authority is already enforced above for this route.)
    const { error: initError } = await initializeTicTacToeGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isChessGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length !== CHESS_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need exactly ${CHESS_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeChessGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isDescribeItGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    const minPlayers =
      game.describe_it_mode === 'individual' ? DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL : DESCRIBE_IT_MIN_PLAYERS
    if (playingPlayers.length < minPlayers) {
      return NextResponse.json({ error: `Need at least ${minPlayers} players to start` }, { status: 400 })
    }

    const { error: initError } = await initializeDescribeItGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 400 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', session_started_at: sessionStartedAt, current_round_number: 1 })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isScrabbleGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < SCRABBLE_MIN_PLAYERS || playingPlayers.length > SCRABBLE_MAX_PLAYERS) {
      return NextResponse.json(
        { error: `Need ${SCRABBLE_MIN_PLAYERS}–${SCRABBLE_MAX_PLAYERS} players to start` },
        { status: 400 }
      )
    }

    const { error: initError } = await initializeScrabbleGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCodewordsGame(gameType)) {
    if (playersData.length < CODEWORDS_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${CODEWORDS_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { data: roleRows } = await supabase
      .from('codewords_player_roles')
      .select('player_id, team, role')
      .eq('game_id', code.toUpperCase())

    let roles = roleRows ?? []
    const playerIds = playersData.map((p) => p.id)
    const randomizeTeams = game.codewords_randomize_teams === true

    if (randomizeTeams && teamsNeedRandomization(playerIds, roles)) {
      const { roles: shuffled, error: shuffleError } = await persistRandomizedRoles(
        getSupabaseAdmin(),
        code.toUpperCase(),
        playerIds,
        roles
      )
      if (shuffleError) return NextResponse.json({ error: shuffleError }, { status: 500 })
      roles = shuffled
    }

    const ready = lobbyReadyForGame(roles, playerIds, randomizeTeams)
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error ?? 'Teams are not ready' }, { status: 400 })
    }

    const finalReady = lobbyReady(roles)
    if (!finalReady.ok) {
      return NextResponse.json({ error: finalReady.error ?? 'Teams are not ready' }, { status: 400 })
    }

    const firstTeamPref = raw.firstTeam
    const startingTeam: 'red' | 'blue' =
      firstTeamPref === 'red' || firstTeamPref === 'blue' ? firstTeamPref : Math.random() < 0.5 ? 'red' : 'blue'
    const customPool = codewordsWordPoolForGame(game)
    if (parseQuestionSource(game.question_source, gameType) === 'custom') {
      if (!customPool || customPool.length < CODEWORDS_MIN_CUSTOM_POOL) {
        return NextResponse.json(
          { error: `Need at least ${CODEWORDS_MIN_CUSTOM_POOL} words in your custom library` },
          { status: 400 }
        )
      }
    }
    const wordUsage = poolUsageToMap(poolUsage.codewords)
    const words = pickBoardWords(customPool ?? undefined, wordUsage)
    const key = generateKey(startingTeam)
    const spymasterTimer = clampCodewordsTimer(game.timer_seconds ?? CODEWORDS_DEFAULT_SPYMASTER_TIMER)
    const operativeTimer = clampCodewordsTimer(game.operative_timer_seconds ?? CODEWORDS_DEFAULT_OPERATIVE_TIMER)

    const { error: boardError } = await getSupabaseAdmin()
      .from('codewords_boards')
      .insert({
        game_id: code.toUpperCase(),
        words,
        key,
        starting_team: startingTeam,
        current_turn: startingTeam,
        spymaster_timer_seconds: spymasterTimer,
        operative_timer_seconds: operativeTimer,
        turn_phase: 'clue',
        turn_deadline_at: turnDeadline(spymasterTimer),
      })

    if (boardError) return NextResponse.json({ error: boardError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isTwoTruthsGame(gameType)) {
    const playerIds = playersData.map((p) => p.id)
    if (playerIds.length < TTL_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${TTL_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const { data: statementRows } = await supabase.from('ttl_statements').select('*').eq('game_id', code.toUpperCase())

    const statements = statementRows ?? []
    const ready = lobbyReadyForTwoTruths(playerIds, statements)
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error ?? 'Not ready to start' }, { status: 400 })
    }

    const submittedPlayerIds = statements.map((s) => s.player_id).filter((id) => playerIds.includes(id))
    const playerOrder = shufflePlayerOrder(submittedPlayerIds)
    let roundRows: ReturnType<typeof buildTtlRoundRows>
    try {
      roundRows = buildTtlRoundRows({
        gameId: code.toUpperCase(),
        statements,
        playerOrder,
        now,
      })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to build rounds' },
        { status: 400 }
      )
    }

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundRows.length,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    // Initialize lives for elimination mode
    if (game.elimination_config) {
      const elimConfig = game.elimination_config as EliminationConfig
      if (elimConfig.mode === 'lives' && elimConfig.startingLives) {
        await getSupabaseAdmin()
          .from('players')
          .update({ lives_remaining: elimConfig.startingLives })
          .eq('game_id', code.toUpperCase())
          .eq('spectator', false)
      }
    }

    return NextResponse.json({ success: true })
  }

  if (isICallOnGame(gameType)) {
    const playerIds = playersData.filter((p) => p.spectator !== true).map((p) => p.id)
    if (playerIds.length < NPAT_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${NPAT_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const playerOrder = npatShufflePlayerOrder(playerIds)
    const roundRow = buildNpatInitialRound({
      gameId: code.toUpperCase(),
      playerOrder,
      now,
    })

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRow)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    // Initialize lives for elimination mode
    if (game.elimination_config) {
      const elimConfig = game.elimination_config as EliminationConfig
      if (elimConfig.mode === 'lives' && elimConfig.startingLives) {
        await getSupabaseAdmin()
          .from('players')
          .update({ lives_remaining: elimConfig.startingLives })
          .eq('game_id', code.toUpperCase())
          .eq('spectator', false)
      }
    }

    return NextResponse.json({ success: true })
  }

  if (isSudokuGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < SUDOKU_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${SUDOKU_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)
    const { roundRow, solution } = buildSudokuRoundRow(code.toUpperCase(), seed)

    const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRow)
      .select('id')
      .single()
    if (roundError || !insertedRound) {
      return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
    }

    // Solution is stored separately (RLS hides it from players); never in the round metadata.
    const { error: solutionError } = await supabase
      .from('sudoku_solutions')
      .insert({ round_id: insertedRound.id, solution })
    if (solutionError) return NextResponse.json({ error: solutionError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isWordHuntGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < WORD_HUNT_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${WORD_HUNT_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)
    const metadata = buildWordHuntMetadata(seed)
    const roundRow = buildWordHuntRoundRow(code.toUpperCase(), metadata)

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRow)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
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
      initialUsageCounts: hotSeatUsage,
    })

    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const { roundRows, roundsCount } = built

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
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

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(allRoundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
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
      ? pickCustomMltQuestions(customPool, poolNeeded, customMltUsage)
      : pickMltQuestions(poolNeeded, mergeUsageMaps(await fetchMltQuestionUsage(supabase), customMltUsage))

    const aiMltQuestions: string[] =
      game.ai_questions_enabled &&
      game.ai_generated_questions &&
      typeof game.ai_generated_questions === 'object' &&
      (game.ai_generated_questions as AiGeneratedQuestions).type === 'mlt'
        ? ((game.ai_generated_questions as Extract<AiGeneratedQuestions, { type: 'mlt' }>).questions ?? [])
        : []

    const mergedPlatformMlt =
      aiMltQuestions.length > 0
        ? mergeAiIntoPlatformPool(
            aiMltQuestions,
            platformQuestions,
            poolNeeded,
            (game.ai_questions_config as AiQuestionsConfig | null)?.ratio ?? 'half'
          )
        : platformQuestions

    const questions = combineLobbyQuestions(
      playerQuestionsEnabled ? playerMltQuestions : [],
      mergedPlatformMlt,
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

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (isNeverHaveIEver(gameType)) {
    if (playersData.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 })
    }

    const { data: playerNhieRows } = await supabase
      .from('player_questions')
      .select('question_text')
      .eq('game_id', code.toUpperCase())
      .eq('question_type', 'mlt')
    const playerNhieQuestions = (playerNhieRows ?? [])
      .map((q) => q.question_text)
      .filter((t): t is string => !!t?.trim())
      .sort(() => Math.random() - 0.5)

    const playerQuestionsEnabled = lobbyAllowsPlayerQuestions(game)
    const questionOrder = parsePlayerQuestionsOrder(game.player_questions_order)
    const effectivePlayerCount = playerQuestionsEnabled ? playerNhieQuestions.length : 0
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
      ? pickCustomMltQuestions(customPool, poolNeeded, customMltUsage)
      : pickNhieQuestions(poolNeeded, mergeUsageMaps(await fetchNhieQuestionUsage(supabase), customMltUsage))

    const aiNhieQuestions: string[] =
      game.ai_questions_enabled &&
      game.ai_generated_questions &&
      typeof game.ai_generated_questions === 'object' &&
      (game.ai_generated_questions as AiGeneratedQuestions).type === 'nhie'
        ? ((game.ai_generated_questions as Extract<AiGeneratedQuestions, { type: 'nhie' }>).questions ?? [])
        : []

    const mergedPlatformNhie =
      aiNhieQuestions.length > 0
        ? mergeAiIntoPlatformPool(
            aiNhieQuestions,
            platformQuestions,
            poolNeeded,
            (game.ai_questions_config as AiQuestionsConfig | null)?.ratio ?? 'half'
          )
        : platformQuestions

    const questions = combineLobbyQuestions(
      playerQuestionsEnabled ? playerNhieQuestions : [],
      mergedPlatformNhie,
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

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
      .eq('id', code.toUpperCase())

    if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (isPickANumber(gameType)) {
    if (playersData.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 players to start' }, { status: 400 })
    }

    const { data: playerPanRows } = await supabase
      .from('player_questions')
      .select('question_text')
      .eq('game_id', code.toUpperCase())
      .eq('question_type', 'mlt')
    const playerPanQuestions = (playerPanRows ?? [])
      .map((q) => q.question_text)
      .filter((t): t is string => !!t?.trim())
      .sort(() => Math.random() - 0.5)

    const playerQuestionsEnabled = lobbyAllowsPlayerQuestions(game)
    const questionOrder = parsePlayerQuestionsOrder(game.player_questions_order)
    const effectivePlayerCount = playerQuestionsEnabled ? playerPanQuestions.length : 0
    const useCustom = parseQuestionSource(game.question_source, gameType) === 'custom'
    const customPool = useCustom ? parseStoredMltQuestions(game.custom_questions) : []
    const poolNeeded = Math.min(
      PAN_DEFAULT_POOL_SIZE,
      useCustom && customPool.length > 0
        ? customPool.length + (playerQuestionsEnabled ? effectivePlayerCount : 0)
        : PAN_DEFAULT_POOL_SIZE + (playerQuestionsEnabled ? effectivePlayerCount : 0)
    )
    const platformQuestions = useCustom
      ? pickCustomMltQuestions(customPool, poolNeeded, customMltUsage)
      : pickPanQuestions(poolNeeded, mergeUsageMaps(await fetchPanQuestionUsage(supabase), customMltUsage))
    const questionPool = combineLobbyQuestions(
      playerQuestionsEnabled ? playerPanQuestions : [],
      platformQuestions,
      poolNeeded,
      playerQuestionsEnabled ? questionOrder : 'uploaded_first'
    )
    if (questionPool.length < PAN_MIN_POOL) {
      return NextResponse.json(
        { error: useCustom ? `Need at least ${PAN_MIN_POOL} custom questions` : 'Not enough prompts available' },
        { status: 400 }
      )
    }

    const { data: participantsData } = await supabase
      .from('participants')
      .select('id, name')
      .eq('game_id', code.toUpperCase())
      .order('display_order')

    const built = buildPickANumberRoundRows({
      gameId: code.toUpperCase(),
      players: playersData,
      participants: participantsData ?? [],
      participantMode: game.participant_mode,
      roundsCount: game.rounds_count,
      now,
    })

    if (!built.ok) {
      return NextResponse.json({ error: built.error }, { status: 400 })
    }

    const { roundRows, roundsCount } = built

    const { error: poolError } = await getSupabaseAdmin()
      .from('games')
      .update({ custom_questions: questionPool })
      .eq('id', code.toUpperCase())
    if (poolError) return NextResponse.json({ error: poolError.message }, { status: 500 })

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundsCount,
      })
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
      return NextResponse.json(
        { error: 'No questions available — upload prompts or wait for player submissions' },
        { status: 400 }
      )
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
    const poolQuestions = pickCustomWyrQuestions(customPool, poolNeeded, customWyrUsage)
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

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
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
      ? pickCustomWyrQuestions(customPool, poolNeeded, customWyrUsage)
      : pickWyrQuestions(poolNeeded, mergeUsageMaps(await fetchWyrQuestionUsage(supabase), customWyrUsage))

    const aiWyrQuestions: { optionA: string; optionB: string }[] =
      game.ai_questions_enabled &&
      game.ai_generated_questions &&
      typeof game.ai_generated_questions === 'object' &&
      (game.ai_generated_questions as AiGeneratedQuestions).type === 'wyr'
        ? ((game.ai_generated_questions as Extract<AiGeneratedQuestions, { type: 'wyr' }>).questions ?? [])
        : []

    const mergedPlatformWyr =
      aiWyrQuestions.length > 0
        ? mergeAiIntoPlatformPool(
            aiWyrQuestions,
            platformQuestions,
            poolNeeded,
            (game.ai_questions_config as AiQuestionsConfig | null)?.ratio ?? 'half'
          )
        : platformQuestions

    const questions = combineLobbyQuestions(
      playerQuestionsEnabled ? playerWyrQuestions : [],
      mergedPlatformWyr,
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

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
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
    const appearanceCounts = appearanceCountsForParticipants(roundPool, poolUsage.participants)
    const genderBased = isGameGenderBased(game)
    let groups: string[][]

    if (genderBased) {
      const participants = roundPool.map((p) => ({
        id: p.id,
        gender: parseParticipantGenderFromDb(p.gender) ?? ('female' as const),
      }))
      groups =
        slotCount <= 3
          ? generateRoundsByGender(participants, game.rounds_count, slotCount as 2 | 3, appearanceCounts)
          : generateGenderBasedNRounds(participants, game.rounds_count, slotCount, appearanceCounts)

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
      groups = generateNRounds(participantIds, game.rounds_count, slotCount, appearanceCounts)
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

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        current_round_number: 1,
        rounds_count: groups.length,
        session_started_at: sessionStartedAt,
      })
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
    const useAllHost = getFullHostListForRounds(game)
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
  const appearanceCounts = appearanceCountsForParticipants(roundPool, poolUsage.participants)

  let trios: string[][]
  if (genderBased) {
    trios = generateRoundsByGender(participants, game.rounds_count, poolSize, appearanceCounts)
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
      poolSize,
      appearanceCounts
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

  const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

  const { error: gameError } = await getSupabaseAdmin()
    .from('games')
    .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
    .eq('id', code.toUpperCase())

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
