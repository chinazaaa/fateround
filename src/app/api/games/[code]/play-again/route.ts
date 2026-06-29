import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { playAgainSchema } from '@/lib/validation'
import {
  parseGameType,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isCodewordsGame,
  isTriviaGame,
  isTwoTruthsGame,
  isTicTacToeGame,
  isChessGame,
  isDescribeItGame,
  isScrabbleGame,
  isICallOnGame,
  isSudokuGame,
  isWordHuntGame,
} from '@/lib/game-types'
import { clearAnonymousRoomSessionData, reopenSecretMessageBoard } from '@/lib/anonymous-messages'
import { clearBingoSessionData } from '@/lib/bingo'
import { clearCodewordsRoundData, CODEWORDS_MIN_CUSTOM_POOL } from '@/lib/codewords'
import { clearMonopolySessionData } from '@/lib/monopoly'
import { clearYahtzeeSessionData } from '@/lib/yahtzee'
import { clearWhotSessionData } from '@/lib/whot'
import { clearCrazyEightsSessionData } from '@/lib/crazy-eights'
import { clearLudoSessionData } from '@/lib/ludo'
import { clearSnakeAndLadderSessionData } from '@/lib/snake-and-ladder'
import { clearTicTacToeSessionData, canTicTacToePlayAgain } from '@/lib/tic-tac-toe'
import { clearChessSessionData, canChessPlayAgain } from '@/lib/chess'
import { clearDescribeItSessionData, canDescribeItPlayAgain } from '@/lib/describe-it'
import { clearScrabbleSessionData, canScrabblePlayAgain } from '@/lib/scrabble'
import { clearNpatSessionData } from '@/lib/npat'
import { clearSudokuSessionData } from '@/lib/sudoku'
import { clearWordHuntSessionData } from '@/lib/word-hunt'
import { clearTriviaSessionData } from '@/lib/trivia'
import { clearTwoTruthsSessionData } from '@/lib/two-truths'
import {
  applyCustomQuestionsUpdate,
  applyParticipantListUpdate,
  applyTriviaSettingsUpdate,
  canReplaceHostParticipantList,
  parseHostPoolCustomQuestions,
  parseHostPoolTriviaQuestions,
  parseHostPoolParticipants,
  replaceHostParticipantList,
} from '@/lib/host-pool-update'
import { extractRoundUsage, extractCodewordsBoardUsage, mergePoolUsageState, parsePoolUsage } from '@/lib/pool-usage'
import { isGameGenderBased } from '@/lib/gender-based'
import { resetSpectatorsForLobby } from '@/lib/viewers'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameType } from '@/types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

type SessionClearer = (
  supabase: SupabaseClient,
  gameId: string
) => Promise<{ error?: string | null; poolUsage?: Record<string, unknown> }>

/**
 * Game types whose Play Again clears per-game session data via the registry below.
 * Typing the registry as exhaustive over this subset (rather than a `Partial`
 * record over all `GameType`s) makes an accidental omission a compile error.
 */
type ClearableSessionGameType = Extract<
  GameType,
  | 'bingo'
  | 'codewords'
  | 'two_truths'
  | 'monopoly'
  | 'yahtzee'
  | 'whot'
  | 'crazy_eights'
  | 'ludo'
  | 'snake_and_ladder'
  | 'chess'
  | 'describe_it'
  | 'scrabble'
  | 'tic_tac_toe'
  | 'i_call_on'
  | 'sudoku'
  | 'word_hunt'
>

/**
 * Per-game session-data clearers run on Play Again — only the entry matching the
 * game's type runs (replaces a 15-branch if-chain; exactly one clearer per request).
 * Games needing special handling are excluded and handled separately above:
 * trivia (must run before the `rounds` delete), anonymous_messages (anon client),
 * and secret_message (reopens its board and early-returns).
 */
const SESSION_CLEARERS: Record<ClearableSessionGameType, SessionClearer> = {
  bingo: clearBingoSessionData,
  codewords: clearCodewordsRoundData,
  two_truths: clearTwoTruthsSessionData,
  monopoly: clearMonopolySessionData,
  yahtzee: clearYahtzeeSessionData,
  whot: clearWhotSessionData,
  crazy_eights: clearCrazyEightsSessionData,
  ludo: clearLudoSessionData,
  snake_and_ladder: clearSnakeAndLadderSessionData,
  chess: clearChessSessionData,
  describe_it: clearDescribeItSessionData,
  scrabble: clearScrabbleSessionData,
  tic_tac_toe: clearTicTacToeSessionData,
  i_call_on: clearNpatSessionData,
  sudoku: clearSudokuSessionData,
  word_hunt: clearWordHuntSessionData,
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data: body, error: bodyError } = await parseJsonBody(req, playAgainSchema)
  if (bodyError) return bodyError

  const {
    hostToken,
    hostPlayerId,
    custom_questions: rawCustomQuestions,
    participants: rawParticipants,
    question_source,
    trivia_category,
    timer_seconds,
    rounds_count,
  } = body
  const gameId = code.toUpperCase()

  const { data: game } = await getSupabaseAdmin().from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const gameType = parseGameType(game.game_type)
  const ticTacToeCanReplay = isTicTacToeGame(gameType)
    ? await canTicTacToePlayAgain(supabase, gameId, game.status)
    : false
  const chessCanReplay = isChessGame(gameType) ? await canChessPlayAgain(supabase, gameId, game.status) : false
  const describeItCanReplay = isDescribeItGame(gameType)
    ? await canDescribeItPlayAgain(supabase, gameId, game.status)
    : false
  const scrabbleCanReplay = isScrabbleGame(gameType) ? await canScrabblePlayAgain(supabase, gameId, game.status) : false
  const canReturnToLobby =
    game.status === 'waiting' ||
    game.status === 'finished' ||
    ticTacToeCanReplay ||
    chessCanReplay ||
    describeItCanReplay ||
    scrabbleCanReplay ||
    (isCodewordsGame(gameType) && game.status === 'active') ||
    (isTwoTruthsGame(gameType) && game.status === 'active') ||
    (isICallOnGame(gameType) && game.status === 'active') ||
    (isSudokuGame(gameType) && game.status === 'active') ||
    (isWordHuntGame(gameType) && game.status === 'active')
  if (!canReturnToLobby) {
    return NextResponse.json({ error: 'Game must be finished before playing again' }, { status: 400 })
  }

  const genderBased = isGameGenderBased(game)

  const [{ data: rounds }, { data: participantsData }, { data: codewordsBoard }] = await Promise.all([
    supabase
      .from('rounds')
      .select('participant_ids, wyr_option_a, wyr_option_b, mlt_question, submitter_player_id, trivia_metadata')
      .eq('game_id', gameId),
    supabase.from('participants').select('id, name, gender').eq('game_id', gameId),
    isCodewordsGame(gameType)
      ? supabase.from('codewords_boards').select('words').eq('game_id', gameId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let poolUsage = mergePoolUsageState(
    parsePoolUsage(game.pool_usage),
    extractRoundUsage(rounds ?? [], participantsData ?? [])
  )
  if (codewordsBoard?.words?.length) {
    poolUsage = mergePoolUsageState(poolUsage, extractCodewordsBoardUsage(codewordsBoard.words))
  }

  const gameUpdate: Record<string, unknown> = {
    status: 'waiting',
    current_round_number: 0,
    session_started_at: null,
    finished_at: null,
    anonymous_messages_trimmed_at: null,
  }

  if (rawCustomQuestions !== undefined && isCodewordsGame(gameType)) {
    const nextWords = parseHostPoolCustomQuestions(rawCustomQuestions, gameType)
    if (!nextWords || !Array.isArray(nextWords) || nextWords.length < CODEWORDS_MIN_CUSTOM_POOL) {
      return NextResponse.json(
        { error: `Need at least ${CODEWORDS_MIN_CUSTOM_POOL} valid words in your library` },
        { status: 400 }
      )
    }
    const { gameUpdate: wordUpdate, poolUsage: nextPoolUsage } = applyCustomQuestionsUpdate(game, nextWords, poolUsage)
    Object.assign(gameUpdate, wordUpdate)
    poolUsage = nextPoolUsage
  } else if (rawCustomQuestions !== undefined && !isTriviaGame(gameType)) {
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
  }

  if (isTriviaGame(gameType)) {
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
  }

  if (rawParticipants !== undefined) {
    if (!canReplaceHostParticipantList(game)) {
      return NextResponse.json({ error: 'This game mode does not support replacing the name list' }, { status: 400 })
    }

    const nextParticipants = parseHostPoolParticipants(rawParticipants, gameType, genderBased)
    if (!nextParticipants) {
      return NextResponse.json({ error: 'Add at least one valid name' }, { status: 400 })
    }

    const { error: replaceError } = await replaceHostParticipantList(supabase, gameId, nextParticipants)
    if (replaceError) return NextResponse.json({ error: replaceError }, { status: 500 })

    poolUsage = applyParticipantListUpdate(game, nextParticipants, poolUsage).poolUsage
  }

  gameUpdate.pool_usage = poolUsage

  const admin = getSupabaseAdmin()

  const { error: votesError } = await admin.from('votes').delete().eq('game_id', gameId)
  if (votesError) return NextResponse.json({ error: votesError.message }, { status: 500 })

  const { error: confessionsError } = await admin.from('confessions').delete().eq('game_id', gameId)
  if (confessionsError) return NextResponse.json({ error: confessionsError.message }, { status: 500 })

  if (isTriviaGame(gameType)) {
    const { error: clearError } = await clearTriviaSessionData(getSupabaseAdmin(), gameId)
    if (clearError) return NextResponse.json({ error: clearError }, { status: 500 })
  }

  const { error: roundsError } = await admin.from('rounds').delete().eq('game_id', gameId)
  if (roundsError) return NextResponse.json({ error: roundsError.message }, { status: 500 })

  const { error: poolError } = await admin.from('wst_quote_pool').delete().eq('game_id', gameId)
  if (poolError) return NextResponse.json({ error: poolError.message }, { status: 500 })

  const { error: pqError } = await admin.from('player_questions').delete().eq('game_id', gameId)
  if (pqError) return NextResponse.json({ error: pqError.message }, { status: 500 })

  const { error: playerNamesError } = await admin
    .from('participants')
    .delete()
    .eq('game_id', gameId)
    .not('submitted_by_player_id', 'is', null)
  if (playerNamesError) return NextResponse.json({ error: playerNamesError.message }, { status: 500 })

  const { error: hotSeatError } = await admin.from('hot_seat_submissions').delete().eq('game_id', gameId)
  if (hotSeatError) return NextResponse.json({ error: hotSeatError.message }, { status: 500 })

  if (isAnonymousMessagesGame(gameType)) {
    const { error: clearError } = await clearAnonymousRoomSessionData(supabase, gameId)
    if (clearError) return NextResponse.json({ error: clearError }, { status: 500 })
  }

  if (isSecretMessageGame(gameType)) {
    const { error: reopenError } = await reopenSecretMessageBoard(supabase, gameId)
    if (reopenError) return NextResponse.json({ error: reopenError }, { status: 500 })
    const { data: updatedSecret, error: secretFetchError } = await supabase
      .from('games')
      .select()
      .eq('id', gameId)
      .single()
    if (secretFetchError) return NextResponse.json({ error: secretFetchError.message }, { status: 500 })
    return NextResponse.json({ success: true, game: updatedSecret })
  }

  // Per-game session cleanup. Exactly one clearer matches the game type (or none for
  // poll games); the special-cased games above (trivia / anonymous / secret) are not
  // in the registry. Several of these tables are RLS-locked to anon writes — admin client.
  const clearSession = (SESSION_CLEARERS as Partial<Record<GameType, SessionClearer>>)[gameType]
  if (clearSession) {
    const { error: clearError, poolUsage: clearedPoolUsage } = await clearSession(getSupabaseAdmin(), gameId)
    if (clearError) return NextResponse.json({ error: clearError }, { status: 500 })
    // Some clearers (e.g. describe_it) carry forward usage state that must survive
    // the final `games` update below — fold it in rather than letting it be clobbered.
    if (clearedPoolUsage) {
      gameUpdate.pool_usage = { ...(gameUpdate.pool_usage as Record<string, unknown>), ...clearedPoolUsage }
    }
  }

  // Service role: `players` is RLS read-only for anon (core-gameplay lockdown), so the
  // anon client silently updates 0 rows here — leaving everyone auto-ready. Use admin.
  const { error: spectatorResetError } = await resetSpectatorsForLobby(
    getSupabaseAdmin(),
    gameId,
    hostPlayerId ? [hostPlayerId] : []
  )
  if (spectatorResetError) return NextResponse.json({ error: spectatorResetError }, { status: 500 })

  const { data: updated, error: gameError } = await getSupabaseAdmin()
    .from('games')
    .update(gameUpdate)
    .eq('id', gameId)
    .select()
    .single()

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true, game: updated })
}
