import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { GAME_BROWSE_FIELDS, countPlayersByGame, type BrowseGameRow } from '@/lib/game-browse'
import { generateGameCode, generateToken } from '@/lib/utils'
import {
  normalizeGender,
  hasEnoughForRounds,
  participantsNeedGenderForGame,
  type ParticipantInput,
} from '@/lib/participants'
import {
  parseGameType,
  roundPoolSize,
  isLobbyGame,
  isWouldYouRather,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isAnonymousGame,
  isPairGame,
  parsePairVoteMode,
  isCustomGame,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isBingoGame,
  isCodewordsGame,
  isTriviaGame,
  isTwoTruthsGame,
  isMonopolyGame,
  isYahtzeeGame,
  isWhotGame,
  isCrazyEightsGame,
  isLudoGame,
  isMahjongGame,
  isTicTacToeGame,
  isChessGame,
  isCheckersGame,
  isAyoGame,
  isMafiaGame,
  isScrabbleGame,
  isDescribeItGame,
  isWordRushGame,
  isICallOnGame,
  isSudokuGame,
  isWordHuntGame,
  isSnakeAndLadderGame,
  isMatchingPairsGame,
  isQuiplashGame,
  isQuickDrawGame,
} from '@/lib/game-types'
import { wstAutoRoundCount } from '@/lib/who-said-this'
import { parseLudoVariant } from '@/lib/ludo'
import { parseMahjongRuleOptions, parseMahjongRuleset } from '@/lib/mahjong-rulesets'
import {
  clampHotSeatMaxCap,
  hotSeatMaxCapUpperBound,
  HOT_SEAT_MIN_PLAYERS,
  HOT_SEAT_MAX_ROUNDS_CAP,
} from '@/lib/hot-seat'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { THIS_OR_THAT_QUESTION_COUNT } from '@/lib/this-or-that-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { NHIE_QUESTION_COUNT } from '@/lib/never-have-i-ever-questions'
import { PAN_MIN_POOL, PAN_QUESTION_COUNT } from '@/lib/pick-a-number-questions'
import { clampPanRounds, PAN_MAX_ROUNDS } from '@/lib/pick-a-number'
import { TRIVIA_QUESTION_COUNT } from '@/lib/trivia-questions'
import { parseStoredDescribeItWords } from '@/lib/describe-it-words'
import {
  parseQuestionSource,
  parseStoredWyrQuestions,
  parseStoredMltQuestions,
  parseStoredTriviaQuestions,
  parseStoredCodewordsWords,
} from '@/lib/custom-questions'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'
import type { ParticipantMode, QuestionSource, TriviaQuestion } from '@/types'
import { createGameSchema, stripHtml } from '@/lib/validation'
import { supportsGenderToggle, defaultGenderBasedForType } from '@/lib/gender-based'
import { parseParticipantMode, usesHostParticipantList } from '@/lib/participant-mode'
import { parseThemeId } from '@/lib/themes'
import { parsePlayerQuestionsEnabled, parsePlayerQuestionsOrder } from '@/lib/player-question-pool'
import { isPeoplePollGame, supportsPlayerNameSubmissions } from '@/lib/player-participant-pool'
import { parseBingoCallMode, clampBingoCallInterval } from '@/lib/bingo'
import { TRIVIA_DEFAULT_ROUNDS, clampTriviaTimer } from '@/lib/trivia'
import { clampTtlTimer, TTL_DEFAULT_TIMER } from '@/lib/two-truths'
import {
  clampQuiplashRounds,
  clampQuiplashSubmitTimer,
  clampQuiplashVoteTimer,
  QUIPLASH_DEFAULT_ROUNDS,
  QUIPLASH_DEFAULT_SUBMIT_TIMER,
  QUIPLASH_DEFAULT_VOTE_TIMER,
} from '@/lib/quiplash'
import { QUIPLASH_PROMPTS } from '@/lib/quiplash-prompts'
import {
  clampQuickDrawDrawTimer,
  clampQuickDrawRounds,
  clampQuickDrawTitleTimer,
  clampQuickDrawVoteTimer,
  clampQuickDrawVariant,
  QUICK_DRAW_DEFAULT_DRAW_TIMER,
  QUICK_DRAW_DEFAULT_ROUNDS,
  QUICK_DRAW_DEFAULT_TITLE_TIMER,
  QUICK_DRAW_DEFAULT_VOTE_TIMER,
} from '@/lib/quick-draw'
import { clampQuickDrawNumTeams, clampQuickDrawPlayMode } from '@/lib/quick-draw-guess'
import { QUICK_DRAW_PROMPTS } from '@/lib/quick-draw-prompts'
import {
  clampNpatMarkingTimer,
  clampNpatTimer,
  clampNpatGameDuration,
  NPAT_DEFAULT_GAME_DURATION,
  NPAT_DEFAULT_MARKING_TIMER,
  NPAT_DEFAULT_TIMER,
} from '@/lib/npat'
import {
  clampCodewordsTimer,
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  CODEWORDS_MIN_CUSTOM_POOL,
} from '@/lib/codewords'
import {
  clampLobbyMaxPlayers,
  fetchGamePlayerLimits,
  lobbyDefaultMaxPlayers,
  type LobbyLimitGameType,
} from '@/lib/game-limits'
import { clampMonopolyGameDuration, clampMonopolyTurnTimer } from '@/lib/monopoly'
import { clampWhotGameDuration } from '@/lib/whot'
import { clampCrazyEightsGameDuration } from '@/lib/crazy-eights'
import { clampBoardGameTurnTimer } from '@/lib/board-game-lobby-settings'
import { clampWordHuntTimer } from '@/lib/word-hunt'
import { clampSudokuGameDuration } from '@/lib/sudoku'
import { clampChessTimer, clampChessBoardTheme, clampChessPieceSet } from '@/lib/chess'
import { clampCheckersTimer } from '@/lib/checkers'
import { clampAyoTimer, parseAyoVariant } from '@/lib/ayo'
import {
  clampScrabbleTimer,
  clampScrabbleGameDuration,
  clampScrabbleClockSeconds,
  parseScrabbleClockMode,
} from '@/lib/scrabble'
import { parseScrabbleDictionaryId } from '@/lib/scrabble-dictionary-meta'
import {
  clampDescribeItMode,
  clampDescribeItRounds,
  clampDescribeItTeams,
  clampDescribeItTurnSeconds,
} from '@/lib/describe-it'
import {
  clampWordRushDifficulty,
  clampWordRushMode,
  clampWordRushPromptMode,
  clampWordRushRounds,
  clampWordRushTeams,
  clampWordRushTurnSeconds,
} from '@/lib/word-rush'
import { gameSupportsViewerSetting, lateJoinPolicyToFields, type LateJoinPolicy } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod/v4'
import { ELIMINATION_COMPATIBLE_TYPES } from '@/types/elimination'

const eliminationConfigSchema = z
  .object({
    mode: z.enum(['per-round', 'lives']),
    rule: z.enum(['bottom-n', 'score-threshold']).optional(),
    eliminateCount: z.coerce.number().int().min(1).max(10).optional(),
    threshold: z.coerce.number().min(0).optional(),
    startingLives: z.coerce.number().int().min(1).max(10).optional(),
    livesLostRule: z.literal('bottom-n').optional(),
  })
  .optional()

const supabase = getSupabaseAnon()

function parseParticipants(
  raw: unknown,
  gameType: ReturnType<typeof parseGameType>,
  genderBased: boolean
): ParticipantInput[] | null {
  if (!Array.isArray(raw)) return null

  const parsed: ParticipantInput[] = []
  const needGender = participantsNeedGenderForGame(gameType, { genderBased })
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
    if (isBinaryChoiceGame(gameType)) return parseStoredWyrQuestions(customQuestions).length
    if (isMostLikelyTo(gameType)) return parseStoredMltQuestions(customQuestions).length
    if (isNeverHaveIEver(gameType)) return parseStoredMltQuestions(customQuestions).length
    if (isPickANumber(gameType)) return parseStoredMltQuestions(customQuestions).length
    if (isTriviaGame(gameType)) return parseStoredTriviaQuestions(customQuestions).length
    if (isQuiplashGame(gameType)) return parseStoredMltQuestions(customQuestions).length
    if (isQuickDrawGame(gameType)) return parseStoredMltQuestions(customQuestions).length
    if (isCodewordsGame(gameType)) return parseStoredCodewordsWords(customQuestions).length
    return 20
  }
  if (isBinaryChoiceGame(gameType)) return isThisOrThat(gameType) ? THIS_OR_THAT_QUESTION_COUNT : WYR_QUESTION_COUNT
  if (isMostLikelyTo(gameType)) return MLT_QUESTION_COUNT
  if (isNeverHaveIEver(gameType)) return NHIE_QUESTION_COUNT
  if (isPickANumber(gameType)) return PAN_QUESTION_COUNT
  if (isTriviaGame(gameType)) return TRIVIA_QUESTION_COUNT
  if (isQuiplashGame(gameType)) return QUIPLASH_PROMPTS.length
  if (isQuickDrawGame(gameType)) return QUICK_DRAW_PROMPTS.length
  return 20
}

function parseCustomQuestionsBody(
  raw: unknown,
  gameType: ReturnType<typeof parseGameType>
): WyrQuestion[] | string[] | TriviaQuestion[] | null {
  if (!Array.isArray(raw)) return null
  if (isBinaryChoiceGame(gameType)) {
    const parsed = parseStoredWyrQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isMostLikelyTo(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isNeverHaveIEver(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isPickANumber(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isTriviaGame(gameType)) {
    const parsed = parseStoredTriviaQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isQuiplashGame(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isQuickDrawGame(gameType)) {
    const parsed = parseStoredMltQuestions(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isCodewordsGame(gameType)) {
    const parsed = parseStoredCodewordsWords(raw)
    return parsed.length > 0 ? parsed : null
  }
  if (isDescribeItGame(gameType)) {
    const parsed = parseStoredDescribeItWords(raw)
    return parsed.length > 0 ? parsed : null
  }
  return null
}

const BROWSE_PAGE_SIZE = 20

// Public browse list: games the host marked public that are still going (waiting/active),
// newest first, cursor-paginated. Mirrors GET /api/rooms. Uses the anon client (RLS-open
// SELECT) and an explicit safe-column list — host_token is revoked from anon.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') ?? String(BROWSE_PAGE_SIZE), 10) || BROWSE_PAGE_SIZE, 1),
    50
  )
  const cursor = searchParams.get('cursor')

  let query = supabase
    .from('games')
    .select(GAME_BROWSE_FIELDS)
    .eq('is_public', true)
    .neq('status', 'finished')
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: games, error } = await query

  if (error) return NextResponse.json({ error: internalErrorMessage('games', error) }, { status: 500 })

  const page = ((games ?? []) as BrowseGameRow[]).slice(0, limit)
  const hasMore = (games ?? []).length > limit
  // Player counts are best-effort: if the count query fails, still return the list
  // (with 0s) rather than failing the whole browse page — but log it, don't hide it.
  let counts: Record<string, number> = {}
  try {
    counts = await countPlayersByGame(
      supabase,
      page.map((game) => game.id)
    )
  } catch (countError) {
    console.error('GET /api/games: player count query failed', countError)
  }

  return NextResponse.json({
    games: page.map((game) => ({ ...game, playerCount: counts[game.id] ?? 0 })),
    hasMore,
    nextCursor: hasMore ? (page[page.length - 1]?.created_at ?? null) : null,
  })
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
    operative_timer_seconds: rawOperativeTimerSeconds,
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
    custom_slots,
    gender_based: rawGenderBased,
    player_questions_enabled: rawPlayerQuestionsEnabled,
    player_questions_order: rawPlayerQuestionsOrder,
    max_players: rawMaxPlayers,
    codewords_player_picks: rawCodewordsPlayerPicks,
    codewords_late_join: rawCodewordsLateJoin,
    codewords_randomize_teams: rawCodewordsRandomizeTeams,
    describe_it_num_teams: rawDescribeItNumTeams,
    describe_it_mode: rawDescribeItMode,
    quick_draw_variant: rawQuickDrawVariant,
    quick_draw_play_mode: rawQuickDrawPlayMode,
    quick_draw_num_teams: rawQuickDrawNumTeams,
    word_rush_num_teams: rawWordRushNumTeams,
    word_rush_mode: rawWordRushMode,
    word_rush_prompt_mode: rawWordRushPromptMode,
    word_rush_difficulty: rawWordRushDifficulty,
    allow_viewers: rawAllowViewers,
    allow_late_players: rawAllowLatePlayers,
    late_join_policy: rawLateJoinPolicy,
    trivia_category: rawTriviaCategory,
    bingo_call_mode: rawBingoCallMode,
    bingo_call_interval_seconds: rawBingoCallInterval,
    game_duration_seconds: rawGameDurationSeconds,
    whot_pick3_enabled: rawWhotPick3Enabled,
    whot_cards_enabled: rawWhotCardsEnabled,
    whot_number_calls_enabled: rawWhotNumberCallsEnabled,
    whot_pick2_stacking: rawWhotPick2Stacking,
    crazy8_action_cards: rawCrazy8ActionCards,
    crazy8_jokers: rawCrazy8Jokers,
    crazy8_pick2_stacking: rawCrazy8Pick2Stacking,
    ludo_variant: rawLudoVariant,
    ayo_variant: rawAyoVariant,
    mahjong_ruleset: rawMahjongRuleset,
    mahjong_rule_options: rawMahjongRuleOptions,
    scrabble_dictionary_id: rawScrabbleDictionaryId,
    scrabble_clock_mode: rawScrabbleClockMode,
    scrabble_clock_seconds: rawScrabbleClockSeconds,
    chess_board_theme: rawChessBoardTheme,
    chess_piece_set: rawChessPieceSet,
  } = parsed.data

  const elimParsed = eliminationConfigSchema.safeParse((body as Record<string, unknown>).elimination_config)
  let eliminationConfig = elimParsed.success ? (elimParsed.data ?? null) : null

  const game_type = parseGameType(rawGameType)
  if (eliminationConfig && !ELIMINATION_COMPATIBLE_TYPES.includes(game_type as any)) {
    eliminationConfig = null
  }
  const gender_based = supportsGenderToggle(game_type)
    ? (rawGenderBased ??
      (isCustomGame(game_type) ? custom_slots?.gender_based === true : defaultGenderBasedForType(game_type)))
    : false
  const participantOpts = { genderBased: gender_based, customSlots: custom_slots ?? null }
  const theme = parseThemeId(rawTheme)
  const question_source = parseQuestionSource(rawQuestionSource, game_type)
  let custom_questions: unknown[] | null = null

  if (
    question_source === 'custom' &&
    (isBinaryChoiceGame(game_type) ||
      isMostLikelyTo(game_type) ||
      isNeverHaveIEver(game_type) ||
      isPickANumber(game_type) ||
      isTriviaGame(game_type) ||
      isQuiplashGame(game_type) ||
      isQuickDrawGame(game_type) ||
      isCodewordsGame(game_type) ||
      isDescribeItGame(game_type))
  ) {
    const cqParsed = parseCustomQuestionsBody(rawCustomQuestions, game_type)
    if (!cqParsed) {
      return NextResponse.json(
        { error: isDescribeItGame(game_type) ? 'Upload at least one word' : 'Upload at least one custom question' },
        { status: 400 }
      )
    }
    custom_questions = cqParsed
  }

  const participant_mode: ParticipantMode =
    isLobbyGame(game_type) ||
    isTriviaGame(game_type) ||
    isQuiplashGame(game_type) ||
    isQuickDrawGame(game_type) ||
    isTwoTruthsGame(game_type) ||
    isICallOnGame(game_type) ||
    isMonopolyGame(game_type) ||
    isYahtzeeGame(game_type) ||
    isWhotGame(game_type) ||
    isCrazyEightsGame(game_type) ||
    isLudoGame(game_type) ||
    isMahjongGame(game_type) ||
    isSnakeAndLadderGame(game_type) ||
    isSudokuGame(game_type) ||
    isWordHuntGame(game_type) ||
    isTicTacToeGame(game_type) ||
    isChessGame(game_type) ||
    isCheckersGame(game_type) ||
    isAyoGame(game_type) ||
    isMafiaGame(game_type) ||
    isScrabbleGame(game_type) ||
    isDescribeItGame(game_type) ||
    isWordRushGame(game_type)
      ? 'joiners'
      : isWhoSaidThis(game_type)
        ? 'import'
        : parseParticipantMode(rawMode)

  let participants: ParticipantInput[] = []
  if (usesHostParticipantList(participant_mode)) {
    const customMinPool =
      isCustomGame(game_type) && custom_slots?.slots?.length ? custom_slots.slots.length : roundPoolSize(game_type)
    const participantsParsed = parseParticipants(rawParticipants, game_type, gender_based)
    if (!participantsParsed || participantsParsed.length < customMinPool) {
      return NextResponse.json({ error: `At least ${customMinPool} participants required` }, { status: 400 })
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
      if (participant_mode === 'import' && participantsParsed.length < HOT_SEAT_MIN_PLAYERS) {
        return NextResponse.json(
          { error: `Need at least ${HOT_SEAT_MIN_PLAYERS} names on the list for Hot Seat` },
          { status: 400 }
        )
      }
    } else if (!hasEnoughForRounds(participantsParsed, game_type, participantOpts)) {
      const min = isCustomGame(game_type) ? customMinPool : roundPoolSize(game_type)
      const errorMsg = !gender_based
        ? `Need at least ${min} names on the list`
        : `Need at least ${min} people of the same gender (male or female) for rounds`
      return NextResponse.json({ error: errorMsg }, { status: 400 })
    }
    participants = participantsParsed
  }

  const maxRounds = lobbyMaxRounds(game_type, question_source, custom_questions)
  const roundsCount =
    isAnonymousMessagesGame(game_type) ||
    isSecretMessageGame(game_type) ||
    isBingoGame(game_type) ||
    isCodewordsGame(game_type) ||
    isTwoTruthsGame(game_type) ||
    isICallOnGame(game_type) ||
    isMonopolyGame(game_type) ||
    isYahtzeeGame(game_type) ||
    isWhotGame(game_type) ||
    isCrazyEightsGame(game_type) ||
    isLudoGame(game_type) ||
    isMahjongGame(game_type) ||
    isSnakeAndLadderGame(game_type) ||
    isSudokuGame(game_type) ||
    isWordHuntGame(game_type) ||
    isTicTacToeGame(game_type) ||
    isChessGame(game_type) ||
    isCheckersGame(game_type) ||
    isAyoGame(game_type) ||
    isMafiaGame(game_type) ||
    isScrabbleGame(game_type)
      ? 1
      : isDescribeItGame(game_type)
        ? clampDescribeItRounds(rounds_count)
        : isWordRushGame(game_type)
          ? clampWordRushRounds(rounds_count)
          : isWhoSaidThis(game_type)
            ? wstAutoRoundCount(participants.length)
            : isHotSeat(game_type)
              ? clampHotSeatMaxCap(
                  rounds_count ?? HOT_SEAT_MIN_PLAYERS,
                  hotSeatMaxCapUpperBound(0, participants.length)
                )
              : isPickANumber(game_type)
                ? clampPanRounds(rounds_count ?? 5)
                : isTriviaGame(game_type)
                  ? Math.min(Math.max(Number(rounds_count) || TRIVIA_DEFAULT_ROUNDS, 1), maxRounds)
                  : isQuiplashGame(game_type)
                    ? clampQuiplashRounds(rounds_count ?? QUIPLASH_DEFAULT_ROUNDS)
                    : isQuickDrawGame(game_type)
                      ? clampQuickDrawRounds(rounds_count ?? QUICK_DRAW_DEFAULT_ROUNDS)
                      : Math.min(Math.max(Number(rounds_count) || 3, 1), maxRounds)

  if (
    question_source === 'custom' &&
    custom_questions &&
    !isPickANumber(game_type) &&
    roundsCount > custom_questions.length
  ) {
    return NextResponse.json(
      { error: `Need at least ${roundsCount} custom questions for ${roundsCount} rounds` },
      { status: 400 }
    )
  }

  if (
    question_source === 'custom' &&
    custom_questions &&
    isPickANumber(game_type) &&
    custom_questions.length < PAN_MIN_POOL
  ) {
    return NextResponse.json(
      { error: `Need at least ${PAN_MIN_POOL} custom questions for the numbered list` },
      { status: 400 }
    )
  }

  if (
    question_source === 'custom' &&
    custom_questions &&
    isCodewordsGame(game_type) &&
    custom_questions.length < CODEWORDS_MIN_CUSTOM_POOL
  ) {
    return NextResponse.json(
      { error: `Need at least ${CODEWORDS_MIN_CUSTOM_POOL} words in your custom library` },
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
  const lobbyLimits = await fetchGamePlayerLimits(supabase)

  function resolveMaxPlayers(type: LobbyLimitGameType, raw: unknown, fallback: number): number {
    return clampLobbyMaxPlayers(type, Number(raw) || fallback, lobbyLimits)
  }

  const maxPlayers = isAnonymousMessagesGame(game_type)
    ? resolveMaxPlayers('anonymous_messages', rawMaxPlayers, lobbyDefaultMaxPlayers('anonymous_messages', lobbyLimits))
    : isBingoGame(game_type)
      ? resolveMaxPlayers('bingo', rawMaxPlayers, lobbyDefaultMaxPlayers('bingo', lobbyLimits))
      : isCodewordsGame(game_type)
        ? resolveMaxPlayers('codewords', rawMaxPlayers, lobbyDefaultMaxPlayers('codewords', lobbyLimits))
        : isTriviaGame(game_type)
          ? resolveMaxPlayers('trivia', rawMaxPlayers, lobbyDefaultMaxPlayers('trivia', lobbyLimits))
          : isQuiplashGame(game_type)
            ? resolveMaxPlayers('quiplash', rawMaxPlayers, lobbyDefaultMaxPlayers('quiplash', lobbyLimits))
            : isQuickDrawGame(game_type)
              ? resolveMaxPlayers('quick_draw', rawMaxPlayers, lobbyDefaultMaxPlayers('quick_draw', lobbyLimits))
              : isTwoTruthsGame(game_type)
                ? resolveMaxPlayers('two_truths', rawMaxPlayers, lobbyDefaultMaxPlayers('two_truths', lobbyLimits))
                : isMonopolyGame(game_type)
                  ? resolveMaxPlayers('monopoly', rawMaxPlayers, lobbyDefaultMaxPlayers('monopoly', lobbyLimits))
                  : isYahtzeeGame(game_type)
                    ? resolveMaxPlayers('yahtzee', rawMaxPlayers, lobbyDefaultMaxPlayers('yahtzee', lobbyLimits))
                    : isWhotGame(game_type)
                      ? resolveMaxPlayers('whot', rawMaxPlayers, lobbyDefaultMaxPlayers('whot', lobbyLimits))
                      : isCrazyEightsGame(game_type)
                        ? resolveMaxPlayers(
                            'crazy_eights',
                            rawMaxPlayers,
                            lobbyDefaultMaxPlayers('crazy_eights', lobbyLimits)
                          )
                        : isLudoGame(game_type)
                          ? resolveMaxPlayers('ludo', rawMaxPlayers, lobbyDefaultMaxPlayers('ludo', lobbyLimits))
                          : isMahjongGame(game_type)
                            ? resolveMaxPlayers(
                                'mahjong',
                                rawMaxPlayers,
                                lobbyDefaultMaxPlayers('mahjong', lobbyLimits)
                              )
                            : isSnakeAndLadderGame(game_type)
                              ? resolveMaxPlayers(
                                  'snake_and_ladder',
                                  rawMaxPlayers,
                                  lobbyDefaultMaxPlayers('snake_and_ladder', lobbyLimits)
                                )
                              : isICallOnGame(game_type)
                                ? resolveMaxPlayers(
                                    'i_call_on',
                                    rawMaxPlayers,
                                    lobbyDefaultMaxPlayers('i_call_on', lobbyLimits)
                                  )
                                : isSudokuGame(game_type)
                                  ? resolveMaxPlayers(
                                      'sudoku',
                                      rawMaxPlayers,
                                      lobbyDefaultMaxPlayers('sudoku', lobbyLimits)
                                    )
                                  : isWordHuntGame(game_type)
                                    ? resolveMaxPlayers(
                                        'word_hunt',
                                        rawMaxPlayers,
                                        lobbyDefaultMaxPlayers('word_hunt', lobbyLimits)
                                      )
                                    : isTicTacToeGame(game_type)
                                      ? resolveMaxPlayers(
                                          'tic_tac_toe',
                                          rawMaxPlayers,
                                          lobbyDefaultMaxPlayers('tic_tac_toe', lobbyLimits)
                                        )
                                      : isChessGame(game_type)
                                        ? resolveMaxPlayers(
                                            'chess',
                                            rawMaxPlayers,
                                            lobbyDefaultMaxPlayers('chess', lobbyLimits)
                                          )
                                        : isCheckersGame(game_type)
                                          ? resolveMaxPlayers(
                                              'checkers',
                                              rawMaxPlayers,
                                              lobbyDefaultMaxPlayers('checkers', lobbyLimits)
                                            )
                                          : isAyoGame(game_type)
                                            ? resolveMaxPlayers(
                                                'ayo',
                                                rawMaxPlayers,
                                                lobbyDefaultMaxPlayers('ayo', lobbyLimits)
                                              )
                                            : isMafiaGame(game_type)
                                              ? resolveMaxPlayers(
                                                  'mafia',
                                                  rawMaxPlayers,
                                                  lobbyDefaultMaxPlayers('mafia', lobbyLimits)
                                                )
                                              : isScrabbleGame(game_type)
                                                ? resolveMaxPlayers(
                                                    'scrabble',
                                                    rawMaxPlayers,
                                                    lobbyDefaultMaxPlayers('scrabble', lobbyLimits)
                                                  )
                                                : isDescribeItGame(game_type)
                                                  ? resolveMaxPlayers(
                                                      'describe_it',
                                                      rawMaxPlayers,
                                                      lobbyDefaultMaxPlayers('describe_it', lobbyLimits)
                                                    )
                                                  : isWordRushGame(game_type)
                                                    ? resolveMaxPlayers(
                                                        'word_rush',
                                                        rawMaxPlayers,
                                                        lobbyDefaultMaxPlayers('word_rush', lobbyLimits)
                                                      )
                                                    : null
  const isSecret = isSecretMessageGame(game_type)
  const lateJoinFields = gameSupportsViewerSetting(game_type)
    ? rawLateJoinPolicy
      ? lateJoinPolicyToFields(rawLateJoinPolicy)
      : {
          allow_viewers: rawAllowViewers !== false && rawCodewordsLateJoin !== false,
          allow_late_players:
            rawAllowLatePlayers !== false && rawAllowViewers !== false && rawCodewordsLateJoin !== false,
        }
    : { allow_viewers: true, allow_late_players: true }
  const { allow_viewers: viewersAllowed, allow_late_players: latePlayersAllowed } = lateJoinFields

  const admin = getSupabaseAdmin()

  const { error: gameError } = await admin.from('games').insert({
    id: gameCode,
    title,
    host_token: hostToken,
    rounds_count: roundsCount,
    timer_seconds: isCodewordsGame(game_type)
      ? clampCodewordsTimer(Number(timer_seconds) || CODEWORDS_DEFAULT_SPYMASTER_TIMER)
      : isTriviaGame(game_type)
        ? clampTriviaTimer(timer_seconds)
        : isQuiplashGame(game_type)
          ? clampQuiplashSubmitTimer(timer_seconds ?? QUIPLASH_DEFAULT_SUBMIT_TIMER)
          : isQuickDrawGame(game_type)
            ? clampQuickDrawDrawTimer(timer_seconds ?? QUICK_DRAW_DEFAULT_DRAW_TIMER)
            : isTwoTruthsGame(game_type)
              ? clampTtlTimer(timer_seconds)
              : isICallOnGame(game_type)
                ? clampNpatTimer(timer_seconds)
                : isMonopolyGame(game_type)
                  ? clampMonopolyTurnTimer(timer_seconds)
                  : isWordHuntGame(game_type)
                    ? clampWordHuntTimer(timer_seconds)
                    : isChessGame(game_type)
                      ? clampChessTimer(timer_seconds)
                      : isCheckersGame(game_type)
                        ? clampCheckersTimer(timer_seconds)
                        : isAyoGame(game_type)
                          ? clampAyoTimer(timer_seconds)
                          : isMafiaGame(game_type)
                            ? Number(timer_seconds) > 0
                              ? Number(timer_seconds)
                              : 60
                            : isScrabbleGame(game_type)
                              ? clampScrabbleTimer(timer_seconds)
                              : isDescribeItGame(game_type)
                                ? clampDescribeItTurnSeconds(timer_seconds)
                                : isWordRushGame(game_type)
                                  ? clampWordRushTurnSeconds(timer_seconds)
                                  : isWhotGame(game_type)
                                    ? clampBoardGameTurnTimer(timer_seconds, 'whot')
                                    : isCrazyEightsGame(game_type)
                                      ? clampBoardGameTurnTimer(timer_seconds, 'crazy_eights')
                                      : isMahjongGame(game_type)
                                        ? clampBoardGameTurnTimer(timer_seconds, 'mahjong')
                                        : isMatchingPairsGame(game_type)
                                          ? Math.max(0, Math.min(600, Math.round(Number(timer_seconds) || 0)))
                                          : [15, 30, 60].includes(Number(timer_seconds))
                                            ? Number(timer_seconds)
                                            : 30,
    ...(isCodewordsGame(game_type)
      ? {
          operative_timer_seconds: clampCodewordsTimer(
            Number(rawOperativeTimerSeconds) || CODEWORDS_DEFAULT_OPERATIVE_TIMER
          ),
          codewords_player_picks: rawCodewordsPlayerPicks !== false,
          codewords_late_join: latePlayersAllowed,
          codewords_randomize_teams: rawCodewordsRandomizeTeams === true,
        }
      : isICallOnGame(game_type)
        ? {
            operative_timer_seconds: clampNpatMarkingTimer(
              Number(rawOperativeTimerSeconds) || NPAT_DEFAULT_MARKING_TIMER
            ),
            game_duration_seconds: clampNpatGameDuration(rawGameDurationSeconds ?? NPAT_DEFAULT_GAME_DURATION),
          }
        : isQuiplashGame(game_type)
          ? {
              operative_timer_seconds: clampQuiplashVoteTimer(
                Number(rawOperativeTimerSeconds) || QUIPLASH_DEFAULT_VOTE_TIMER
              ),
            }
          : isQuickDrawGame(game_type)
            ? {
                operative_timer_seconds: clampQuickDrawTitleTimer(
                  Number(rawOperativeTimerSeconds) || QUICK_DRAW_DEFAULT_TITLE_TIMER
                ),
                game_duration_seconds: clampQuickDrawVoteTimer(
                  Number(rawGameDurationSeconds) || QUICK_DRAW_DEFAULT_VOTE_TIMER
                ),
              }
            : {}),
    ...(isDescribeItGame(game_type)
      ? {
          describe_it_num_teams: clampDescribeItTeams(rawDescribeItNumTeams),
          describe_it_mode: clampDescribeItMode(rawDescribeItMode),
        }
      : {}),
    ...(isQuickDrawGame(game_type)
      ? {
          quick_draw_variant: clampQuickDrawVariant(rawQuickDrawVariant),
          quick_draw_play_mode: clampQuickDrawPlayMode(rawQuickDrawPlayMode),
          quick_draw_num_teams: clampQuickDrawNumTeams(rawQuickDrawNumTeams),
        }
      : {}),
    ...(isWordRushGame(game_type)
      ? {
          word_rush_num_teams: clampWordRushTeams(rawWordRushNumTeams),
          word_rush_mode: clampWordRushMode(rawWordRushMode),
          word_rush_prompt_mode: clampWordRushPromptMode(rawWordRushPromptMode),
          word_rush_difficulty: clampWordRushDifficulty(rawWordRushDifficulty),
        }
      : {}),
    ...(gameSupportsViewerSetting(game_type)
      ? { allow_viewers: viewersAllowed, allow_late_players: latePlayersAllowed }
      : {}),
    anonymous:
      isAnonymousMessagesGame(game_type) || isSecretMessageGame(game_type) || isAnonymousGame(game_type)
        ? true
        : anonymous !== false,
    auto_reveal: auto_reveal !== false,
    auto_submit_behavior: auto_submit_behavior === 'random' ? 'random' : 'no_answer',
    participant_mode,
    participant_filter:
      participant_mode === 'voters' || (isHotSeat(game_type) && participant_mode === 'import')
        ? participant_mode === 'voters'
          ? 'all'
          : 'joined'
        : participant_filter === 'joined'
          ? 'joined'
          : 'all',
    pair_vote_mode:
      isPairGame(game_type) || (isCustomGame(game_type) && (custom_slots?.slots?.length ?? 0) === 2)
        ? parsePairVoteMode(rawPairVoteMode)
        : 'any',
    question_source:
      isWouldYouRather(game_type) ||
      isThisOrThat(game_type) ||
      isNeverHaveIEver(game_type) ||
      isPickANumber(game_type) ||
      isMostLikelyTo(game_type) ||
      isTriviaGame(game_type) ||
      isQuiplashGame(game_type) ||
      isQuickDrawGame(game_type) ||
      isCodewordsGame(game_type) ||
      isDescribeItGame(game_type)
        ? question_source
        : 'platform',
    custom_questions,
    trivia_category: isTriviaGame(game_type) ? (rawTriviaCategory === 'tech' ? 'tech' : 'general') : null,
    game_type,
    theme,
    status: isSecret ? 'active' : 'waiting',
    is_public: parsed.data.isPublic ?? false,
    current_round_number: 0,
    ...(isSecret ? { session_started_at: new Date().toISOString() } : {}),
    wst_quote_source: parsed.data.wst_quote_source ?? 'player',
    gender_based: supportsGenderToggle(game_type) ? gender_based : true,
    player_questions_enabled:
      isBinaryChoiceGame(game_type) ||
      isMostLikelyTo(game_type) ||
      isNeverHaveIEver(game_type) ||
      isPickANumber(game_type)
        ? parsePlayerQuestionsEnabled(rawPlayerQuestionsEnabled)
        : supportsPlayerNameSubmissions({ game_type, participant_mode })
          ? parsePlayerQuestionsEnabled(rawPlayerQuestionsEnabled)
          : isPeoplePollGame(game_type)
            ? false
            : true,
    player_questions_order:
      isBinaryChoiceGame(game_type) ||
      isMostLikelyTo(game_type) ||
      isNeverHaveIEver(game_type) ||
      isPickANumber(game_type)
        ? parsePlayerQuestionsOrder(rawPlayerQuestionsOrder)
        : supportsPlayerNameSubmissions({ game_type, participant_mode })
          ? parsePlayerQuestionsOrder(rawPlayerQuestionsOrder)
          : 'players_first',
    ...(maxPlayers != null ? { max_players: maxPlayers } : {}),
    ...(isBingoGame(game_type)
      ? {
          bingo_call_mode: parseBingoCallMode(rawBingoCallMode),
          bingo_call_interval_seconds: clampBingoCallInterval(rawBingoCallInterval),
        }
      : {}),
    ...(isScrabbleGame(game_type)
      ? (() => {
          const clockMode = parseScrabbleClockMode(rawScrabbleClockMode)
          return {
            // Chess-clock mode has no whole-game cap; keep it zeroed so the
            // whole-game expiry can never fire against a chess game.
            game_duration_seconds: clockMode === 'chess' ? 0 : clampScrabbleGameDuration(rawGameDurationSeconds),
            scrabble_dictionary_id: parseScrabbleDictionaryId(rawScrabbleDictionaryId),
            scrabble_clock_mode: clockMode,
            scrabble_clock_seconds: clockMode === 'chess' ? clampScrabbleClockSeconds(rawScrabbleClockSeconds) : 0,
          }
        })()
      : {}),
    ...(isChessGame(game_type)
      ? {
          chess_board_theme: clampChessBoardTheme(rawChessBoardTheme),
          chess_piece_set: clampChessPieceSet(rawChessPieceSet),
        }
      : {}),
    ...(isMonopolyGame(game_type)
      ? { game_duration_seconds: clampMonopolyGameDuration(rawGameDurationSeconds) }
      : isWhotGame(game_type)
        ? {
            game_duration_seconds: clampWhotGameDuration(rawGameDurationSeconds),
            whot_pick3_enabled: rawWhotPick3Enabled !== false,
            whot_cards_enabled: rawWhotCardsEnabled !== false,
            whot_number_calls_enabled: rawWhotNumberCallsEnabled !== false,
            whot_pick2_stacking: rawWhotPick2Stacking !== false,
          }
        : isCrazyEightsGame(game_type)
          ? {
              game_duration_seconds: clampCrazyEightsGameDuration(rawGameDurationSeconds),
              crazy8_action_cards: rawCrazy8ActionCards !== false,
              crazy8_jokers: rawCrazy8Jokers === true,
              crazy8_pick2_stacking: rawCrazy8Pick2Stacking !== false,
            }
          : isLudoGame(game_type)
            ? { ludo_variant: parseLudoVariant(rawLudoVariant) }
            : isAyoGame(game_type)
              ? { ayo_variant: parseAyoVariant(rawAyoVariant) }
              : isMahjongGame(game_type)
              ? {
                  mahjong_ruleset: parseMahjongRuleset(rawMahjongRuleset),
                  mahjong_rule_options: parseMahjongRuleOptions(rawMahjongRuleOptions),
                }
              : isMatchingPairsGame(game_type)
                ? { game_duration_seconds: rawGameDurationSeconds ?? 0 }
                : isSudokuGame(game_type)
                  ? { game_duration_seconds: clampSudokuGameDuration(rawGameDurationSeconds ?? 0) }
                  : isMafiaGame(game_type)
                    ? {
                        mafia_doctor_enabled: parsed.data.mafia_doctor_enabled !== false,
                        mafia_detective_enabled: parsed.data.mafia_detective_enabled !== false,
                        mafia_anonymous_votes: parsed.data.mafia_anonymous_votes === true,
                      }
                    : {}),
    ...(isCustomGame(game_type) && parsed.data.custom_slots
      ? {
          custom_slots: {
            ...parsed.data.custom_slots,
            gender_based: supportsGenderToggle(game_type) ? gender_based : false,
          },
        }
      : {}),
    elimination_config: eliminationConfig,
  })

  if (gameError) {
    return NextResponse.json({ error: internalErrorMessage('games', gameError) }, { status: 500 })
  }

  if (usesHostParticipantList(participant_mode) && participants.length > 0) {
    const participantRows = participants.map((p, index) => ({
      game_id: gameCode,
      name: p.name,
      gender: p.gender,
      display_order: index,
    }))

    const { error: partError } = await admin.from('participants').insert(participantRows)
    if (partError) {
      await admin.from('games').delete().eq('id', gameCode)
      return NextResponse.json({ error: internalErrorMessage('games', partError) }, { status: 500 })
    }
  }

  return NextResponse.json({ gameCode, hostToken })
}
