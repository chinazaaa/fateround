import type { EliminationConfig } from '@/types/elimination'
import { internalErrorMessage } from '@/lib/api-errors'
import { withGameNotification } from '@/lib/push-route'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
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
  isDescribeItGame,
  isWordRushGame,
  isICallOnGame,
  isSudokuGame,
  isWordHuntGame,
  isMatchingPairsGame,
  isQuiplashGame,
  isQuickDrawGame,
  isCrosswordGame,
  isWordSearchGame,
  isWordScrambleGame,
  isWordGroupingGame,
  isLandmineGame,
  isWordleRoomGame,
} from '@/lib/game-types'
import { isGameGenderBased } from '@/lib/gender-based'
import { getCustomSlotCount } from '@/lib/custom-game'
import { buildHotSeatRoundRows } from '@/lib/hot-seat'
import { buildPickANumberRoundRows } from '@/lib/pick-a-number'
import { buildRoundsFromDeck, wstAutoRoundCount, WST_DECK_MIN_ENTRIES } from '@/lib/who-said-this'
import { pickWyrQuestions } from '@/lib/would-you-rather-questions'
import { pickThisOrThatQuestions, THIS_OR_THAT_QUESTION_COUNT } from '@/lib/this-or-that-questions'
import { pickMltQuestions } from '@/lib/most-likely-to-questions'
import { loadPlatformEntries } from '@/lib/platform-content'
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
  parseStoredWstDeck,
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
import { GAME_START_SPECS, startCountError, startHumanSeatError } from '@/lib/game-start'
import {
  initializeDescribeItGame,
  DESCRIBE_IT_MIN_PLAYERS,
  DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL,
} from '@/lib/describe-it'
import { WORD_RUSH_MIN_PLAYERS, WORD_RUSH_MIN_PLAYERS_INDIVIDUAL } from '@/lib/word-rush'
import { initializeWordRushGame } from '@/lib/word-rush-server'
import { buildNpatInitialRound, NPAT_MIN_PLAYERS, shufflePlayerOrder as npatShufflePlayerOrder } from '@/lib/npat'
import {
  buildLandmineInitialRound,
  clampLandmineMineCount,
  gameLandmineMineSource,
  LANDMINE_MIN_PLAYERS,
  shufflePlayerOrder as landmineShufflePlayerOrder,
} from '@/lib/landmine'
import { buildSudokuRoundRow, SUDOKU_MIN_PLAYERS } from '@/lib/sudoku'
import {
  buildCrosswordRoundRow,
  CROSSWORD_MIN_PLAYERS,
  generateCrossword,
  CROSSWORD_DIFFICULTY_SPECS,
  parseCrosswordDifficulty,
} from '@/lib/crossword'
import type { CrosswordMetadata } from '@/lib/crossword'
import {
  buildCrosswordPuzzle,
  parseCrosswordEntries,
  findCrosswordTheme,
  crosswordThemeOptions,
} from '@/lib/crossword-puzzles'
import {
  buildWordSearchRoundRow,
  WORD_SEARCH_MIN_PLAYERS,
  generateWordSearch,
  WORD_SEARCH_DIFFICULTY_SPECS,
  parseWordSearchDifficulty,
} from '@/lib/word-search'
import type { WordSearchMetadata, WordSearchPlacement } from '@/lib/word-search'
import {
  buildWordSearchPuzzle,
  parseWordSearchEntries,
  findWordSearchTheme,
  wordSearchThemeOptions,
} from '@/lib/word-search-puzzles'
import {
  WORD_SCRAMBLE_MIN_PLAYERS,
  WORD_SCRAMBLE_DIFFICULTY_SPECS,
  parseWordScrambleDifficulty,
  buildWordScrambleRoundRow,
  type WordScrambleMetadata,
} from '@/lib/word-scramble'
import {
  buildWordScramblePuzzle,
  buildWordScrambleFromEntries,
  parseWordScrambleEntries,
  findWordScrambleTheme,
  wordScrambleThemeOptions,
} from '@/lib/word-scramble-puzzles'
import {
  WORD_GROUPING_MIN_PLAYERS,
  parseStoredWordGroupingPuzzles,
  pickWordGroupingPuzzle,
  type WordGroupingPuzzleEntry,
} from '@/lib/word-grouping'
import {
  generateWordGroupingPuzzle,
  generateWordGroupingFromContent,
  getWordGroupingPuzzleBank,
  type WordGroupingPuzzleResult,
} from '@/lib/daily-word-grouping'
import { buildWordHuntRoundRow, WORD_HUNT_MIN_PLAYERS } from '@/lib/word-hunt'
import {
  buildWordleRoomRoundRow,
  buildWordleRoomProgressRows,
  buildWordleRoomSequence,
  clampWordleRoomCategory,
  clampWordleRoomWordCount,
  wordleRoomCategoryLabel,
  WORDLE_ROOM_MIN_PLAYERS,
  type WordleRoomMetadata,
} from '@/lib/wordle-room'
import { buildWordHuntMetadata } from '@/lib/word-hunt-dictionary'
import {
  buildMatchingPairsRoundMetadata,
  buildMatchingPairsRoundRow,
  MATCHING_PAIRS_MIN_PLAYERS,
  type MatchingPairsGridSize,
} from '@/lib/memory-match'
import {
  QUIPLASH_MIN_PLAYERS,
  buildQuiplashRoundRows,
  clampQuiplashSubmitTimer,
  quiplashUsageFromPrompts,
} from '@/lib/quiplash'
import { pickCustomQuiplashPrompts, pickQuiplashPrompts } from '@/lib/quiplash-prompts'
import {
  buildQuickDrawAssignmentRows,
  buildQuickDrawRoundRows,
  clampQuickDrawDrawTimer,
  quickDrawUsageFromPrompts,
  QUICK_DRAW_MIN_PLAYERS,
  isQuickDrawGuessVariant,
  clampQuickDrawVariant,
} from '@/lib/quick-draw'
import {
  QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL,
  QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM,
  clampQuickDrawNumTeams,
  clampQuickDrawPlayMode,
  initializeQuickDrawGuessGame,
} from '@/lib/quick-draw-guess'
import { pickCustomQuickDrawPrompts, pickQuickDrawPrompts } from '@/lib/quick-draw-prompts'
import { appearanceCountsForParticipants, mergeUsageMaps, parsePoolUsage, poolUsageToMap } from '@/lib/pool-usage'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { recordSeenContent, fetchSeenContentForPlayers } from '@/lib/seen-content'
import { triviaQuestionKey } from '@/lib/trivia-questions'
import { wyrQuestionKey } from '@/lib/pool-key'
import { codewordPoolKey } from '@/lib/codewords-pool'
import { quiplashPromptKey } from '@/lib/quiplash-prompts'
import { quickDrawPromptKey } from '@/lib/quick-draw-prompts'
import { wordGroupingPuzzleKey } from '@/lib/word-grouping'

const supabase = getSupabaseAnon()

import type { ParticipantForRounds } from '@/lib/utils'

async function initializeEliminationLives(
  gameCode: string,
  eliminationConfig: unknown
): Promise<{ error: string | null }> {
  if (!eliminationConfig) return { error: null }
  const elimConfig = eliminationConfig as EliminationConfig
  if (elimConfig.mode === 'lives' && elimConfig.startingLives) {
    const { error } = await getSupabaseAdmin()
      .from('players')
      .update({ lives_remaining: elimConfig.startingLives })
      .eq('game_id', gameCode)
      .eq('spectator', false)
    if (error) return { error: internalErrorMessage('games/code/start', error) }
  }
  return { error: null }
}
import type { AiGeneratedQuestions, AiQuestionsConfig, TriviaQuestion } from '@/types'

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

async function handlePost(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
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
    .select('id, gender, identity_gender, participant_id, name, spectator, profile_id, is_bot')
    .eq('game_id', code.toUpperCase())

  if (!playersData?.length) {
    return NextResponse.json({ error: 'Need at least one player to start' }, { status: 400 })
  }

  const profileIds = playersData.map((p) => p.profile_id as string | null).filter((id): id is string => id != null)
  const seenCounts =
    profileIds.length > 0
      ? await fetchSeenContentForPlayers(getSupabaseAdmin(), profileIds, gameType)
      : new Map<string, number>()

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

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
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

    const triviaUsage = mergeUsageMaps(
      poolUsageToMap(poolUsage.trivia as Record<string, number> | undefined),
      seenCounts
    )
    // Platform source: draw from the admin bank for this category (variant), else the built-in pool.
    const adminTriviaPool = useCustom
      ? []
      : await loadPlatformEntries<TriviaQuestion>(getSupabaseAdmin(), 'trivia', category)
    const questions = useCustom
      ? pickCustomTriviaQuestions(customPool, game.rounds_count, triviaUsage)
      : adminTriviaPool.length > 0
        ? pickCustomTriviaQuestions(adminTriviaPool, game.rounds_count, triviaUsage)
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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

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

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    const { error: elimError } = await initializeEliminationLives(code.toUpperCase(), game.elimination_config)
    if (elimError) return NextResponse.json({ error: elimError }, { status: 500 })

    recordSeenContent(getSupabaseAdmin(), code.toUpperCase(), 'trivia', questions.map(triviaQuestionKey))
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

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const startSpec = GAME_START_SPECS[gameType]
  if (startSpec) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    const countError = startCountError(playingPlayers.length, startSpec)
    if (countError) return NextResponse.json({ error: countError }, { status: 400 })
    const humanError = startHumanSeatError(playingPlayers)
    if (humanError) return NextResponse.json({ error: humanError }, { status: 400 })

    // Board games seed their tables via the service role (RLS-locked to anon writes);
    // host authority is already enforced above for this route.
    const { error: initError } = await startSpec.initialize(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id),
      game
    )
    if (initError) return NextResponse.json({ error: initError }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
        // A "same settings" replay lands here — clear the ready-up flag now that we've dealt.
        replay_pending: false,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isDescribeItGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    const minPlayers =
      game.describe_it_mode === 'individual' ? DESCRIBE_IT_MIN_PLAYERS_INDIVIDUAL : DESCRIBE_IT_MIN_PLAYERS
    if (playingPlayers.length < minPlayers) {
      return NextResponse.json({ error: `Need at least ${minPlayers} players to start` }, { status: 400 })
    }

    const { error: initError, internal: initInternal } = await initializeDescribeItGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: initInternal ? 500 : 400 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', session_started_at: sessionStartedAt, current_round_number: 1 })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isWordRushGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    const minPlayers = game.word_rush_mode === 'individual' ? WORD_RUSH_MIN_PLAYERS_INDIVIDUAL : WORD_RUSH_MIN_PLAYERS
    if (playingPlayers.length < minPlayers) {
      return NextResponse.json({ error: `Need at least ${minPlayers} players to start` }, { status: 400 })
    }

    const { error: initError, internal: initInternal } = await initializeWordRushGame(
      getSupabaseAdmin(),
      code.toUpperCase(),
      playingPlayers.map((p) => p.id)
    )
    if (initError) return NextResponse.json({ error: initError }, { status: initInternal ? 500 : 400 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', session_started_at: sessionStartedAt, current_round_number: 1 })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
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
    const wordUsage = mergeUsageMaps(poolUsageToMap(poolUsage.codewords), seenCounts)
    // Platform source: draw the board from the admin bank when present, else the built-in pool
    // (pickBoardWords falls back to CODEWORDS_WORD_POOL when given an empty/undefined pool).
    const adminCwPool =
      parseQuestionSource(game.question_source, gameType) === 'custom'
        ? []
        : await loadPlatformEntries<string>(getSupabaseAdmin(), 'codewords')
    const boardPool = customPool ?? (adminCwPool.length > 0 ? adminCwPool : undefined)
    const words = pickBoardWords(boardPool, wordUsage)
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

    if (boardError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', boardError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    recordSeenContent(getSupabaseAdmin(), code.toUpperCase(), 'codewords', words.map(codewordPoolKey))
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
        { error: internalErrorMessage('games/code/start', err, 'Failed to build rounds') },
        { status: 400 }
      )
    }

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    // Only players who submitted statements enter the game; everyone else (the "Waiting…"
    // players in the lobby) becomes a watch-only viewer so they don't count as guessers.
    // Mirror resetSpectatorsForLobby: mark everyone a spectator, then un-spectator submitters.
    const { error: spectatorError } = await getSupabaseAdmin()
      .from('players')
      .update({ spectator: true })
      .eq('game_id', code.toUpperCase())
    if (spectatorError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', spectatorError) }, { status: 500 })

    const { error: participantError } = await getSupabaseAdmin()
      .from('players')
      .update({ spectator: false })
      .eq('game_id', code.toUpperCase())
      .in('id', submittedPlayerIds)
    if (participantError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', participantError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundRows.length,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    const { error: elimError } = await initializeEliminationLives(code.toUpperCase(), game.elimination_config)
    if (elimError) return NextResponse.json({ error: elimError }, { status: 500 })

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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    const { error: elimError } = await initializeEliminationLives(code.toUpperCase(), game.elimination_config)
    if (elimError) return NextResponse.json({ error: elimError }, { status: 500 })

    return NextResponse.json({ success: true })
  }

  if (isLandmineGame(gameType)) {
    const playerIds = playersData.filter((p) => p.spectator !== true).map((p) => p.id)
    if (playerIds.length < LANDMINE_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${LANDMINE_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const playerOrder = landmineShufflePlayerOrder(playerIds)
    const roundRow = buildLandmineInitialRound({
      gameId: code.toUpperCase(),
      playerOrder,
      mineCount: clampLandmineMineCount(game.landmine_mine_count),
      now,
      manual: gameLandmineMineSource(game) === 'manual',
    })

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRow)
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

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
    if (solutionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', solutionError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isCrosswordGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < CROSSWORD_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${CROSSWORD_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)

    // Custom content pool (a stored answer/clue list) overrides the platform theme; the
    // same generator packs both. Falls back to the platform theme if custom is empty.
    // Replay variety for BOTH custom pools and built-in themes: exclude answers used in earlier
    // games of this room (tracked in pool_usage), resetting the cycle once the bank runs low.
    const poolUsage = parsePoolUsage(game.pool_usage)
    const crosswordUsed = { ...(poolUsage.crossword ?? {}) }
    for (const [key, count] of seenCounts) {
      const upper = key.toUpperCase()
      crosswordUsed[upper] = (crosswordUsed[upper] ?? 0) + count
    }
    let built: { metadata: CrosswordMetadata; solution: string[][] } | null = null
    let nextCrosswordUsage: Record<string, number> | undefined
    const customRows = Array.isArray(game.custom_questions) ? (game.custom_questions as Record<string, string>[]) : []
    // A stale custom pool (e.g. from a replay, or before the host switched back to a built-in
    // theme in the lobby) must NOT override a built-in platform theme. Only use the pool when the
    // game is NOT on a built-in theme: a custom/library upload (question_source != platform) or an
    // admin theme (platform, but *_theme holds the theme NAME, not a built-in id).
    const onBuiltinTheme =
      parseQuestionSource(game.question_source, gameType) === 'platform' &&
      crosswordThemeOptions().some((t) => t.id === game.crossword_theme)
    if (!onBuiltinTheme && customRows.length > 0) {
      const entries = parseCrosswordEntries(customRows)
      if (entries.length >= 4) {
        let used = new Set(Object.keys(crosswordUsed).map((w) => w.toUpperCase()))
        if (entries.filter((e) => !used.has(e.answer.toUpperCase())).length < 12) used = new Set()
        const fresh = entries.filter((e) => !used.has(e.answer.toUpperCase()))
        built = generateCrossword(fresh.length >= 4 ? fresh : entries, { size: 12, seed, targetWords: 12, minWords: 4 })
        if (built) {
          const clueTexts = new Set(built.metadata.clues.map((c) => c.clue))
          const usedAnswers = entries.filter((e) => clueTexts.has(e.clue)).map((e) => e.answer.toUpperCase())
          const base = used.size === 0 ? {} : crosswordUsed
          for (const a of usedAnswers) base[a] = (base[a] ?? 0) + 1
          nextCrosswordUsage = base
        }
      }
    }
    let puzzle: { metadata: CrosswordMetadata; solution: string[][] }
    if (built) {
      puzzle = built
    } else {
      const theme = findCrosswordTheme(game.crossword_theme)
      const spec = CROSSWORD_DIFFICULTY_SPECS[parseCrosswordDifficulty(game.crossword_difficulty)]
      let used = new Set(Object.keys(crosswordUsed).map((w) => w.toUpperCase()))
      if (theme.entries.filter((e) => !used.has(e.answer.toUpperCase())).length < spec.targetWords) {
        used = new Set() // cycle exhausted — start fresh
      }
      puzzle = buildCrosswordPuzzle(theme.id, game.crossword_difficulty, seed, [...used])
      const clueTexts = new Set(puzzle.metadata.clues.map((c) => c.clue))
      const usedAnswers = theme.entries.filter((e) => clueTexts.has(e.clue)).map((e) => e.answer.toUpperCase())
      const base = used.size === 0 ? {} : crosswordUsed
      for (const a of usedAnswers) base[a] = (base[a] ?? 0) + 1
      nextCrosswordUsage = base
    }

    const { roundRow, solution } = buildCrosswordRoundRow(code.toUpperCase(), puzzle.metadata, puzzle.solution)

    const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRow)
      .select('id')
      .single()
    if (roundError || !insertedRound) {
      return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
    }

    // Solution letters are stored separately (RLS hides them from players).
    const { error: solutionError } = await supabase
      .from('crossword_solutions')
      .insert({ round_id: insertedRound.id, solution })
    if (solutionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', solutionError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
        ...(nextCrosswordUsage
          ? { pool_usage: { ...parsePoolUsage(game.pool_usage), crossword: nextCrosswordUsage } }
          : {}),
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    if (nextCrosswordUsage) {
      recordSeenContent(
        getSupabaseAdmin(),
        code.toUpperCase(),
        'crossword',
        Object.keys(nextCrosswordUsage).map((w) => w.toLowerCase())
      )
    }
    return NextResponse.json({ success: true })
  }

  if (isWordSearchGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < WORD_SEARCH_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${WORD_SEARCH_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)

    // A custom word pool (stored word list) overrides the platform theme; both feed the same
    // generator. Falls back to the platform theme if custom is empty or too small.
    // Replay variety for BOTH custom pools and built-in themes (tracked in pool_usage).
    const poolUsage = parsePoolUsage(game.pool_usage)
    const wsUsed = { ...(poolUsage.word_search ?? {}) }
    for (const [key, count] of seenCounts) {
      const upper = key.toUpperCase()
      wsUsed[upper] = (wsUsed[upper] ?? 0) + count
    }
    let built: { metadata: WordSearchMetadata; solution: WordSearchPlacement[] } | null = null
    let nextWordSearchUsage: Record<string, number> | undefined
    const customRows = Array.isArray(game.custom_questions) ? (game.custom_questions as Record<string, string>[]) : []
    // See crossword note: a stale pool must not override a built-in platform theme.
    const onBuiltinTheme =
      parseQuestionSource(game.question_source, gameType) === 'platform' &&
      wordSearchThemeOptions().some((t) => t.id === game.word_search_theme)
    if (!onBuiltinTheme && customRows.length > 0) {
      const entries = parseWordSearchEntries(customRows)
      if (entries.length >= 4) {
        const spec = WORD_SEARCH_DIFFICULTY_SPECS[parseWordSearchDifficulty(game.word_search_difficulty)]
        const words = entries.map((e) => e.word)
        let used = new Set(Object.keys(wsUsed).map((w) => w.toUpperCase()))
        if (words.filter((w) => !used.has(w.toUpperCase())).length < spec.targetWords) used = new Set()
        const fresh = words.filter((w) => !used.has(w.toUpperCase()))
        built = generateWordSearch(fresh.length >= 4 ? fresh : words, {
          size: spec.size,
          seed,
          targetWords: spec.targetWords,
          directions: spec.directions,
          minWords: 4,
        })
        if (built) {
          built.metadata.difficulty = parseWordSearchDifficulty(game.word_search_difficulty)
          const base = used.size === 0 ? {} : wsUsed
          for (const w of built.metadata.words) base[w.toUpperCase()] = (base[w.toUpperCase()] ?? 0) + 1
          nextWordSearchUsage = base
        }
      }
    }
    let puzzle: { metadata: WordSearchMetadata; solution: WordSearchPlacement[] }
    if (built) {
      puzzle = built
    } else {
      const theme = findWordSearchTheme(game.word_search_theme)
      const spec = WORD_SEARCH_DIFFICULTY_SPECS[parseWordSearchDifficulty(game.word_search_difficulty)]
      let used = new Set(Object.keys(wsUsed).map((w) => w.toUpperCase()))
      if (theme.words.filter((w) => !used.has(w.toUpperCase())).length < spec.targetWords) {
        used = new Set() // cycle exhausted — start fresh
      }
      puzzle = buildWordSearchPuzzle(theme.id, game.word_search_difficulty, seed, [...used])
      const base = used.size === 0 ? {} : wsUsed
      for (const w of puzzle.metadata.words) base[w.toUpperCase()] = (base[w.toUpperCase()] ?? 0) + 1
      nextWordSearchUsage = base
    }

    const { roundRow, solution } = buildWordSearchRoundRow(code.toUpperCase(), puzzle.metadata, puzzle.solution)

    const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRow)
      .select('id')
      .single()
    if (roundError || !insertedRound) {
      return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
    }

    // Word placements are stored separately (RLS hides them from players).
    const { error: solutionError } = await supabase
      .from('word_search_solutions')
      .insert({ round_id: insertedRound.id, solution })
    if (solutionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', solutionError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
        ...(nextWordSearchUsage
          ? { pool_usage: { ...parsePoolUsage(game.pool_usage), word_search: nextWordSearchUsage } }
          : {}),
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'word_search',
      puzzle.metadata.words.map((w) => w.trim().toLowerCase())
    )
    return NextResponse.json({ success: true })
  }

  if (isWordScrambleGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < WORD_SCRAMBLE_MIN_PLAYERS) {
      return NextResponse.json(
        { error: `Need at least ${WORD_SCRAMBLE_MIN_PLAYERS} players to start` },
        { status: 400 }
      )
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)

    // A custom word pool (stored word[,hint] list) overrides the platform theme; both feed the
    // same builder. Falls back to the platform theme if custom is empty or too small.
    // Replay variety for BOTH custom pools and built-in themes (tracked in pool_usage).
    const poolUsage = parsePoolUsage(game.pool_usage)
    const scrambleUsed = { ...(poolUsage.word_scramble ?? {}) }
    for (const [key, count] of seenCounts) {
      const upper = key.toUpperCase()
      scrambleUsed[upper] = (scrambleUsed[upper] ?? 0) + count
    }
    const spec = WORD_SCRAMBLE_DIFFICULTY_SPECS[parseWordScrambleDifficulty(game.word_scramble_difficulty)]
    let built: { metadata: WordScrambleMetadata; solution: string[] } | null = null
    let nextUsage: Record<string, number> | undefined
    const customRows = Array.isArray(game.custom_questions) ? (game.custom_questions as Record<string, string>[]) : []
    // See crossword note: a stale pool must not override a built-in platform theme.
    const onBuiltinTheme =
      parseQuestionSource(game.question_source, gameType) === 'platform' &&
      wordScrambleThemeOptions().some((t) => t.id === game.word_scramble_theme)
    if (!onBuiltinTheme && customRows.length > 0) {
      const entries = parseWordScrambleEntries(customRows)
      if (entries.length >= 4) {
        let used = new Set(Object.keys(scrambleUsed).map((w) => w.toUpperCase()))
        const freshInWindow = entries.filter(
          (e) => e.word.length >= spec.minLen && e.word.length <= spec.maxLen && !used.has(e.word.toUpperCase())
        )
        if (freshInWindow.length < spec.count) used = new Set() // cycle exhausted — start fresh
        const poolEntries = entries.filter((e) => !used.has(e.word.toUpperCase()))
        built = buildWordScrambleFromEntries(
          poolEntries.length >= 4 ? poolEntries : entries,
          game.word_scramble_difficulty,
          seed
        )
        if (built) {
          built.metadata.difficulty = parseWordScrambleDifficulty(game.word_scramble_difficulty)
          const base = used.size === 0 ? {} : scrambleUsed
          for (const w of built.solution) base[w.toUpperCase()] = (base[w.toUpperCase()] ?? 0) + 1
          nextUsage = base
        }
      }
    }
    let puzzle: { metadata: WordScrambleMetadata; solution: string[] }
    if (built) {
      puzzle = built
    } else {
      const theme = findWordScrambleTheme(game.word_scramble_theme)
      let used = new Set(Object.keys(scrambleUsed).map((w) => w.toUpperCase()))
      const fresh = theme.entries
        .map((e) => e.word)
        .filter((w) => w.length >= spec.minLen && w.length <= spec.maxLen && !used.has(w.toUpperCase()))
      if (fresh.length < spec.count) used = new Set() // cycle exhausted — start fresh
      puzzle = buildWordScramblePuzzle(theme.id, game.word_scramble_difficulty, seed, [...used])
      const base = used.size === 0 ? {} : scrambleUsed
      for (const w of puzzle.solution) base[w.toUpperCase()] = (base[w.toUpperCase()] ?? 0) + 1
      nextUsage = base
    }

    const roundRow = buildWordScrambleRoundRow(code.toUpperCase(), puzzle.metadata)
    const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRow)
      .select('id')
      .single()
    if (roundError || !insertedRound) {
      return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
    }

    // Answers are stored separately (RLS hides them from players).
    const { error: solutionError } = await supabase
      .from('word_scramble_solutions')
      .insert({ round_id: insertedRound.id, solution: puzzle.solution })
    if (solutionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', solutionError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
        ...(nextUsage ? { pool_usage: { ...parsePoolUsage(game.pool_usage), word_scramble: nextUsage } } : {}),
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'word_scramble',
      puzzle.solution.map((w) => w.trim().toLowerCase())
    )
    return NextResponse.json({ success: true })
  }

  if (isWordGroupingGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < WORD_GROUPING_MIN_PLAYERS) {
      return NextResponse.json(
        { error: `Need at least ${WORD_GROUPING_MIN_PLAYERS} players to start` },
        { status: 400 }
      )
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)

    // Pool priority: custom (library pack or CSV upload) → platform_content (admin-seeded) →
    // built-in PUZZLE_BANK. Normalise every source through the shared validator so a bad
    // custom row can't sneak past — anything invalid falls through to the next source.
    const customRows = Array.isArray(game.custom_questions) ? game.custom_questions : []
    let pool: WordGroupingPuzzleEntry[] = parseStoredWordGroupingPuzzles(customRows) ?? []
    if (pool.length === 0) {
      const platformEntries = await loadPlatformEntries<{ groups: unknown[] }>(getSupabaseAdmin(), 'word_grouping')
      pool = parseStoredWordGroupingPuzzles(platformEntries) ?? []
    }

    // Replay variety: skip puzzles this game has already dealt. Persists across play-again
    // rounds in `game.pool_usage.word_grouping`, resetting the cycle once every puzzle in the
    // pool has been used. Without this, play-again on a small custom pack (or unlucky seeds
    // against the built-in bank) kept dealing the same puzzle back.
    const wgUsageBase = parsePoolUsage(game.pool_usage).word_grouping ?? {}
    const wgUsage: Record<string, number> = { ...wgUsageBase }
    for (const [key, count] of seenCounts) {
      wgUsage[key] = (wgUsage[key] ?? 0) + count
    }
    let puzzleResult: WordGroupingPuzzleResult | null = null
    let nextUsage: Record<string, number> | undefined
    if (pool.length > 0) {
      const picked = pickWordGroupingPuzzle(pool, seed, wgUsage)
      if (picked) {
        // generateWordGroupingFromContent handles the single-puzzle shape by shuffling its
        // 16 words with the seed — pass it as a one-element array so idx = 0 = our pick.
        puzzleResult = generateWordGroupingFromContent([picked.puzzle], seed, game.game_duration_seconds ?? 300)
        nextUsage = picked.nextUsage
      }
    }
    // Built-in bank fallback: also apply usage tracking against the whole PUZZLE_BANK so the
    // same repeat-avoidance behaviour holds even when no custom/platform pool is configured.
    if (!puzzleResult) {
      const bankPool: WordGroupingPuzzleEntry[] = getWordGroupingPuzzleBank()
      const picked = pickWordGroupingPuzzle(bankPool, seed, wgUsage)
      if (picked) {
        puzzleResult = generateWordGroupingFromContent([picked.puzzle], seed, game.game_duration_seconds ?? 300)
        nextUsage = picked.nextUsage
      }
    }
    // Last-resort belt-and-braces: if every path above failed (shouldn't be possible — the
    // built-in bank is 48 puzzles and always parses), fall back to the seed-only generator.
    if (!puzzleResult) {
      puzzleResult = generateWordGroupingPuzzle(seed, game.game_duration_seconds ?? 300)
    }

    const roundRow = {
      game_id: code.toUpperCase(),
      round_number: 1,
      status: 'active' as const,
      started_at: sessionStartedAt,
      // `rounds.participant_ids` is NOT NULL — poll games fill it with the round's participants;
      // puzzle games don't have that concept, so mirror crossword/word_scramble/word_hunt and
      // insert an empty array rather than let the default fall to NULL.
      participant_ids: [] as string[],
      word_grouping_metadata: { words: puzzleResult.puzzleData.words },
    }

    const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRow)
      .select('id')
      .single()
    if (roundError || !insertedRound) {
      return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
    }

    const { error: solutionError } = await getSupabaseAdmin()
      .from('word_grouping_solutions')
      .insert({ round_id: insertedRound.id, solution: { groups: puzzleResult.puzzleData.solution.groups } })
    if (solutionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', solutionError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
        // Persist the used-puzzles set so the next play-again round can skip what this one
        // just dealt. Merge with the game's existing pool_usage so we don't clobber other
        // games' tracking (single jsonb column shared across game types).
        ...(nextUsage
          ? {
              pool_usage: {
                ...(parsePoolUsage(game.pool_usage) as Record<string, unknown>),
                word_grouping: nextUsage,
              },
            }
          : {}),
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    if (puzzleResult) {
      const groups = puzzleResult.puzzleData.solution.groups as { category: string }[]
      recordSeenContent(getSupabaseAdmin(), code.toUpperCase(), 'word_grouping', [wordGroupingPuzzleKey({ groups })])
    }
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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isWordleRoomGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < WORDLE_ROOM_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${WORDLE_ROOM_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff)
    const category = clampWordleRoomCategory(game.wordle_room_category)
    const wordCount = clampWordleRoomWordCount(game.wordle_room_word_count)

    // Optional library pool the host picked on the create page. When present, we sample the
    // word sequence from it (seeded shuffle) instead of the built-in category bank, and the
    // player-facing badge shows "Custom" so joiners know they're not on the platform banks.
    const customPool = Array.isArray(game.wordle_room_custom_words)
      ? (game.wordle_room_custom_words as { word?: string; hint?: string }[])
          .map((e) => ({
            word: (e?.word ?? '').toLowerCase().replace(/[^a-z]/g, ''),
            hint: typeof e?.hint === 'string' ? e.hint : '',
          }))
          .filter((e) => e.word.length >= 3 && e.word.length <= 8)
      : []
    const useCustom = customPool.length >= wordCount

    const customLabel = typeof game.content_label === 'string' ? game.content_label.trim() : ''
    const metadata: WordleRoomMetadata = {
      category,
      categoryLabel: useCustom ? customLabel || 'Custom' : wordleRoomCategoryLabel(category),
      word_count: wordCount,
      seed,
    }

    // Build the fixed word sequence ONCE per room. Only the seed travels in the anon-readable
    // round metadata — the words themselves live in the RLS-locked solutions table, so nobody
    // can read ahead in a competitive race.
    const words = useCustom
      ? (() => {
          // Seeded Fisher–Yates over the custom pool, first `wordCount` entries — same shuffle
          // approach as buildWordleRoomSequence to keep the sample deterministic per seed.
          let s = (seed ^ 0x9e3779b9) >>> 0 || 1
          const rng = () => {
            s ^= s << 13
            s ^= s >>> 17
            s ^= s << 5
            return (s >>> 0) / 0x100000000
          }
          const idx = customPool.map((_, i) => i)
          for (let i = idx.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1))
            ;[idx[i], idx[j]] = [idx[j], idx[i]]
          }
          return idx.slice(0, wordCount).map((k) => customPool[k]!)
        })()
      : buildWordleRoomSequence(seed, category, wordCount)

    const roundRow = buildWordleRoomRoundRow(code.toUpperCase(), metadata)
    const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRow)
      .select('id')
      .single()
    if (roundError || !insertedRound) {
      return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
    }

    const { error: solutionError } = await getSupabaseAdmin()
      .from('wordle_room_solutions')
      .insert({ round_id: insertedRound.id, words })
    if (solutionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', solutionError) }, { status: 500 })

    // Seed a progress row per seated player so the live standings track from the first guess.
    const progressRows = buildWordleRoomProgressRows(
      code.toUpperCase(),
      insertedRound.id,
      playingPlayers.map((p) => p.id)
    )
    const { error: progressError } = await getSupabaseAdmin().from('wordle_room_progress').insert(progressRows)
    if (progressError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', progressError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: 1,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isMatchingPairsGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < MATCHING_PAIRS_MIN_PLAYERS) {
      return NextResponse.json(
        { error: `Need at least ${MATCHING_PAIRS_MIN_PLAYERS} player to start` },
        { status: 400 }
      )
    }

    // Resolve grid size from game settings (stored in game_duration_seconds:
    // 0 = Standard/8 pairs, 16 = Large/16 pairs).
    const gridSizePairs: MatchingPairsGridSize = game.game_duration_seconds === 16 ? 16 : 8
    const playerIds = playingPlayers.map((p: { id: string }) => p.id)
    const roundsCount = game.rounds_count ?? 1

    // Create N round rows — round 1 active, rest pending.
    let firstRoundId: string | null = null
    for (let r = 1; r <= roundsCount; r++) {
      const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff) ^ (r * 0x10000)
      const metadata = buildMatchingPairsRoundMetadata(code.toUpperCase(), seed, gridSizePairs, playerIds)
      const roundRow = buildMatchingPairsRoundRow(code.toUpperCase(), metadata, r)

      const { data: insertedRound, error: roundError } = await getSupabaseAdmin()
        .from('rounds')
        .insert(roundRow)
        .select('id')
        .single()
      if (roundError || !insertedRound) {
        return NextResponse.json({ error: roundError?.message ?? 'Failed to create round' }, { status: 500 })
      }
      if (r === 1) firstRoundId = insertedRound.id
    }

    if (!firstRoundId) {
      return NextResponse.json({ error: 'Failed to create initial round' }, { status: 500 })
    }

    // Seed per-player progress rows for round 1 so realtime tracks from the start.
    const progressRows = playerIds.map((playerId: string) => ({
      game_id: code.toUpperCase(),
      round_id: firstRoundId,
      player_id: playerId,
      pairs_matched: 0,
      wrong_attempts: 0,
      finished: false,
    }))
    const { error: progressError } = await getSupabaseAdmin().from('memory_match_progress').insert(progressRows)
    if (progressError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', progressError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundsCount,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isQuiplashGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)
    if (playingPlayers.length < QUIPLASH_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${QUIPLASH_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const questionSource = parseQuestionSource(game.question_source, gameType)
    const customPool = parseStoredMltQuestions(game.custom_questions)
    const useCustom = questionSource === 'custom'

    if (useCustom && customPool.length < game.rounds_count) {
      return NextResponse.json(
        { error: `Need at least ${game.rounds_count} custom prompts — upload more or lower the round count` },
        { status: 400 }
      )
    }

    const quiplashUsage = mergeUsageMaps(
      poolUsageToMap(poolUsage.quiplash as Record<string, number> | undefined),
      seenCounts
    )
    const adminQuiplashPool = useCustom ? [] : await loadPlatformEntries<string>(getSupabaseAdmin(), 'quiplash')
    const prompts = useCustom
      ? pickCustomQuiplashPrompts(customPool, game.rounds_count, quiplashUsage)
      : adminQuiplashPool.length > 0
        ? pickCustomQuiplashPrompts(adminQuiplashPool, game.rounds_count, quiplashUsage)
        : pickQuiplashPrompts(game.rounds_count, quiplashUsage)

    if (prompts.length === 0) {
      return NextResponse.json({ error: 'No prompts available' }, { status: 400 })
    }

    const roundRows = buildQuiplashRoundRows({
      gameId: code.toUpperCase(),
      prompts,
      now,
    })

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const submitTimer = clampQuiplashSubmitTimer(game.timer_seconds)
    const writingDeadline = new Date(Date.now() + submitTimer * 1000).toISOString()

    const { error: sessionError } = await getSupabaseAdmin().from('quiplash_sessions').insert({
      game_id: code.toUpperCase(),
      phase: 'writing',
      battle_index: 0,
      turn_deadline_at: writingDeadline,
    })
    if (sessionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', sessionError) }, { status: 500 })

    const updatedPoolUsage = {
      ...poolUsage,
      quiplash: {
        ...(poolUsage.quiplash ?? {}),
        ...quiplashUsageFromPrompts(prompts),
      },
    }

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundRows.length,
        pool_usage: updatedPoolUsage,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'quiplash',
      prompts.map((p) => quiplashPromptKey(p.prompt))
    )
    return NextResponse.json({ success: true })
  }

  if (isQuickDrawGame(gameType)) {
    const playingPlayers = playersData.filter((p) => p.spectator !== true)

    if (isQuickDrawGuessVariant(game.quick_draw_variant)) {
      const minPlayers =
        game.quick_draw_play_mode === 'individual'
          ? QUICK_DRAW_GUESS_MIN_PLAYERS_INDIVIDUAL
          : QUICK_DRAW_GUESS_MIN_PLAYERS_TEAM
      if (playingPlayers.length < minPlayers) {
        return NextResponse.json({ error: `Need at least ${minPlayers} players to start` }, { status: 400 })
      }

      const { error: initError, internal: initInternal } = await initializeQuickDrawGuessGame(
        getSupabaseAdmin(),
        code.toUpperCase(),
        playingPlayers.map((p) => p.id)
      )
      if (initError) return NextResponse.json({ error: initError }, { status: initInternal ? 500 : 400 })

      const { error: gameError } = await getSupabaseAdmin()
        .from('games')
        .update({ status: 'active', session_started_at: sessionStartedAt, current_round_number: 1 })
        .eq('id', code.toUpperCase())
      if (gameError)
        return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (playingPlayers.length < QUICK_DRAW_MIN_PLAYERS) {
      return NextResponse.json({ error: `Need at least ${QUICK_DRAW_MIN_PLAYERS} players to start` }, { status: 400 })
    }

    const questionSource = parseQuestionSource(game.question_source, gameType)
    const customPool = parseStoredMltQuestions(game.custom_questions)
    const useCustom = questionSource === 'custom'
    const promptsNeeded = game.rounds_count * playingPlayers.length

    if (useCustom && customPool.length < promptsNeeded) {
      return NextResponse.json(
        { error: `Need at least ${promptsNeeded} custom prompts for this player count and round count` },
        { status: 400 }
      )
    }

    const quickDrawUsage = mergeUsageMaps(
      poolUsageToMap(poolUsage.quick_draw as Record<string, number> | undefined),
      seenCounts
    )
    const adminQdPool = useCustom ? [] : await loadPlatformEntries<string>(getSupabaseAdmin(), 'quick_draw', 'lie')
    const prompts = useCustom
      ? pickCustomQuickDrawPrompts(customPool, promptsNeeded, quickDrawUsage)
      : adminQdPool.length > 0
        ? pickCustomQuickDrawPrompts(adminQdPool, promptsNeeded, quickDrawUsage)
        : pickQuickDrawPrompts(promptsNeeded, quickDrawUsage)

    if (prompts.length < promptsNeeded) {
      return NextResponse.json({ error: 'Not enough prompts available' }, { status: 400 })
    }

    const roundRows = buildQuickDrawRoundRows({
      gameId: code.toUpperCase(),
      roundCount: game.rounds_count,
      now,
    })

    const { data: insertedRounds, error: roundError } = await getSupabaseAdmin()
      .from('rounds')
      .insert(roundRows)
      .select('id, round_number')
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const assignmentRows = buildQuickDrawAssignmentRows({
      gameId: code.toUpperCase(),
      rounds: (insertedRounds ?? []).map((r) => ({ id: r.id, round_number: r.round_number })),
      playerIds: playingPlayers.map((p) => p.id),
      prompts,
    })

    if (assignmentRows.length > 0) {
      const { error: assignmentError } = await getSupabaseAdmin().from('quick_draw_assignments').insert(assignmentRows)
      if (assignmentError)
        return NextResponse.json({ error: internalErrorMessage('games/code/start', assignmentError) }, { status: 500 })
    }

    const drawTimer = clampQuickDrawDrawTimer(game.timer_seconds)
    const drawingDeadline = new Date(Date.now() + drawTimer * 1000).toISOString()

    const { error: sessionError } = await getSupabaseAdmin().from('quick_draw_sessions').insert({
      game_id: code.toUpperCase(),
      phase: 'drawing',
      drawing_index: 0,
      turn_deadline_at: drawingDeadline,
    })
    if (sessionError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', sessionError) }, { status: 500 })

    const updatedPoolUsage = {
      ...poolUsage,
      quick_draw: {
        ...(poolUsage.quick_draw ?? {}),
        ...quickDrawUsageFromPrompts(prompts),
      },
    }

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundRows.length,
        pool_usage: updatedPoolUsage,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'quick_draw',
      prompts.map((p) => quickDrawPromptKey(p.prompt))
    )
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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundsCount,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

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

    let playerRoundRows: ReturnType<typeof buildRoundsFromDeck> = []
    let deckRoundRows: ReturnType<typeof buildRoundsFromDeck> = []
    const joinedPlayerIds = playersData.filter((p) => p.spectator !== true).map((p) => p.id)

    // Pre-set roster: build choice-rounds from the host deck stored in games.custom_questions
    // (Platform / Library / uploaded CSV). Players just join and guess the author from choices —
    // no name list or player submissions needed.
    if (wstQuoteSource === 'deck') {
      const deck = parseStoredWstDeck(game.custom_questions)
      if (deck.length < WST_DECK_MIN_ENTRIES) {
        return NextResponse.json(
          { error: `Add at least ${WST_DECK_MIN_ENTRIES} quotes to the deck before starting` },
          { status: 400 }
        )
      }
      deckRoundRows = buildRoundsFromDeck({
        gameId: code.toUpperCase(),
        participantIds: joinedPlayerIds,
        deck: deck.slice(0, wstAutoRoundCount(deck.length)),
        startIndex: 0,
        now,
      })
    }

    // Players submit: each player-authored question (quote + options + correct) is a round.
    if (wstQuoteSource === 'player') {
      const { data: poolEntries } = await supabase.from('wst_quote_pool').select('*').eq('game_id', code.toUpperCase())
      const deck = (poolEntries ?? [])
        .map((e) => ({
          quote: typeof e.quote_text === 'string' ? e.quote_text.trim() : '',
          options: Array.isArray(e.options) ? e.options.map((o: unknown) => String(o).trim()).filter(Boolean) : [],
          correctIndex: typeof e.correct_index === 'number' ? e.correct_index : -1,
        }))
        .filter((q) => q.quote && q.options.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.options.length)
      if (deck.length < WST_DECK_MIN_ENTRIES) {
        return NextResponse.json(
          { error: 'Need at least 2 questions submitted in the lobby before starting' },
          { status: 400 }
        )
      }
      playerRoundRows = buildRoundsFromDeck({
        gameId: code.toUpperCase(),
        participantIds: joinedPlayerIds,
        deck: deck.slice(0, wstAutoRoundCount(deck.length)),
        startIndex: 0,
        now,
      })
    }

    const allRoundRows = [...deckRoundRows, ...playerRoundRows]
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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: allRoundRows.length,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

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
    // Platform source: draw from the admin-managed bank (platform_content) when it has content,
    // otherwise fall back to the hardcoded MLT_QUESTIONS. Read via service-role (RLS-locked table).
    const mltPlatformUsage = mergeUsageMaps(await fetchMltQuestionUsage(supabase), customMltUsage, seenCounts)
    const adminMltPool = useCustom ? [] : await loadPlatformEntries<string>(getSupabaseAdmin(), 'most_likely_to')
    const platformQuestions = useCustom
      ? pickCustomMltQuestions(customPool, poolNeeded, customMltUsage)
      : adminMltPool.length > 0
        ? pickCustomMltQuestions(adminMltPool, poolNeeded, mltPlatformUsage)
        : pickMltQuestions(poolNeeded, mltPlatformUsage)

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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'most_likely_to',
      questions.map((q) => q.trim().toLowerCase())
    )
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
    // Platform source: draw from the admin bank (platform_content) when present, else the hardcoded array.
    const nhiePlatformUsage = mergeUsageMaps(await fetchNhieQuestionUsage(supabase), customMltUsage, seenCounts)
    const adminNhiePool = useCustom ? [] : await loadPlatformEntries<string>(getSupabaseAdmin(), 'never_have_i_ever')
    const platformQuestions = useCustom
      ? pickCustomMltQuestions(customPool, poolNeeded, customMltUsage)
      : adminNhiePool.length > 0
        ? pickCustomMltQuestions(adminNhiePool, poolNeeded, nhiePlatformUsage)
        : pickNhieQuestions(poolNeeded, nhiePlatformUsage)

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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'never_have_i_ever',
      questions.map((q) => q.trim().toLowerCase())
    )
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
    const panPlatformUsage = mergeUsageMaps(await fetchPanQuestionUsage(supabase), customMltUsage, seenCounts)
    const adminPanPool = useCustom ? [] : await loadPlatformEntries<string>(getSupabaseAdmin(), 'pick_a_number')
    const platformQuestions = useCustom
      ? pickCustomMltQuestions(customPool, poolNeeded, customMltUsage)
      : adminPanPool.length > 0
        ? pickCustomMltQuestions(adminPanPool, poolNeeded, panPlatformUsage)
        : pickPanQuestions(poolNeeded, panPlatformUsage)
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
    if (poolError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', poolError) }, { status: 500 })

    const { error: roundError } = await getSupabaseAdmin().from('rounds').insert(roundRows)
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        session_started_at: sessionStartedAt,
        current_round_number: 1,
        rounds_count: roundsCount,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'pick_a_number',
      questionPool.map((q) => q.trim().toLowerCase())
    )
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
    // Use the built-in pool unless the host chose custom/library (folded to a stored pool).
    // Legacy games may carry custom_questions with a stale 'platform' source — honor those too.
    const useCustom = parseQuestionSource(game.question_source, gameType) !== 'platform' || customPool.length > 0
    const platformPoolSize = useCustom ? customPool.length : THIS_OR_THAT_QUESTION_COUNT
    const totalAvailable = platformPoolSize + effectivePlayerCount
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
    const totUsage = mergeUsageMaps(customWyrUsage, seenCounts)
    const adminTotPool = useCustom
      ? []
      : await loadPlatformEntries<{ optionA: string; optionB: string }>(getSupabaseAdmin(), 'this_or_that')
    const poolQuestions = useCustom
      ? pickCustomWyrQuestions(customPool, poolNeeded, totUsage)
      : adminTotPool.length > 0
        ? pickCustomWyrQuestions(adminTotPool, poolNeeded, totUsage)
        : pickThisOrThatQuestions(poolNeeded, totUsage)
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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'this_or_that',
      questions.map((q) => wyrQuestionKey(q.optionA, q.optionB))
    )
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
    const wyrPlatformUsage = mergeUsageMaps(await fetchWyrQuestionUsage(supabase), customWyrUsage, seenCounts)
    const adminWyrPool = useCustom
      ? []
      : await loadPlatformEntries<{ optionA: string; optionB: string }>(getSupabaseAdmin(), 'would_you_rather')
    const platformQuestions = useCustom
      ? pickCustomWyrQuestions(customPool, poolNeeded, customWyrUsage)
      : adminWyrPool.length > 0
        ? pickCustomWyrQuestions(adminWyrPool, poolNeeded, wyrPlatformUsage)
        : pickWyrQuestions(poolNeeded, wyrPlatformUsage)

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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

    recordSeenContent(
      getSupabaseAdmin(),
      code.toUpperCase(),
      'would_you_rather',
      questions.map((q) => wyrQuestionKey(q.optionA, q.optionB))
    )
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
    if (roundError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

    const { error: gameError } = await getSupabaseAdmin()
      .from('games')
      .update({
        status: 'active',
        current_round_number: 1,
        rounds_count: groups.length,
        session_started_at: sessionStartedAt,
      })
      .eq('id', code.toUpperCase())

    if (gameError)
      return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

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
  if (roundError)
    return NextResponse.json({ error: internalErrorMessage('games/code/start', roundError) }, { status: 500 })

  const { error: gameError } = await getSupabaseAdmin()
    .from('games')
    .update({ status: 'active', current_round_number: 1, session_started_at: sessionStartedAt })
    .eq('id', code.toUpperCase())

  if (gameError)
    return NextResponse.json({ error: internalErrorMessage('games/code/start', gameError) }, { status: 500 })

  return NextResponse.json({ success: true })
}

export const POST = withGameNotification('game_started', handlePost)
