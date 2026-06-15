import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { playAgainSchema } from '@/lib/validation'
import {
  parseGameType,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isBingoGame,
} from '@/lib/game-types'
import { clearAnonymousRoomSessionData, reopenSecretMessageBoard } from '@/lib/anonymous-messages'
import { clearBingoSessionData } from '@/lib/bingo'
import {
  applyCustomQuestionsUpdate,
  applyParticipantListUpdate,
  canReplaceHostParticipantList,
  parseHostPoolCustomQuestions,
  parseHostPoolParticipants,
  replaceHostParticipantList,
} from '@/lib/host-pool-update'
import {
  extractRoundUsage,
  mergePoolUsageState,
  parsePoolUsage,
} from '@/lib/pool-usage'
import { isGameGenderBased } from '@/lib/gender-based'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = playAgainSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, custom_questions: rawCustomQuestions, participants: rawParticipants } = parsed.data
  const gameId = code.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'finished') {
    return NextResponse.json({ error: 'Game must be finished before playing again' }, { status: 400 })
  }

  const gameType = parseGameType(game.game_type)
  const genderBased = isGameGenderBased(game)

  const [{ data: rounds }, { data: participantsData }] = await Promise.all([
    supabase
      .from('rounds')
      .select('participant_ids, wyr_option_a, wyr_option_b, mlt_question, submitter_player_id')
      .eq('game_id', gameId),
    supabase.from('participants').select('id, name, gender').eq('game_id', gameId),
  ])

  let poolUsage = mergePoolUsageState(
    parsePoolUsage(game.pool_usage),
    extractRoundUsage(rounds ?? [], participantsData ?? [])
  )

  const gameUpdate: Record<string, unknown> = {
    status: 'waiting',
    current_round_number: 0,
    session_started_at: null,
    anonymous_messages_trimmed_at: null,
  }

  if (rawCustomQuestions !== undefined) {
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

  const { error: votesError } = await supabase.from('votes').delete().eq('game_id', gameId)
  if (votesError) return NextResponse.json({ error: votesError.message }, { status: 500 })

  const { error: confessionsError } = await supabase.from('confessions').delete().eq('game_id', gameId)
  if (confessionsError) return NextResponse.json({ error: confessionsError.message }, { status: 500 })

  const { error: roundsError } = await supabase.from('rounds').delete().eq('game_id', gameId)
  if (roundsError) return NextResponse.json({ error: roundsError.message }, { status: 500 })

  const { error: poolError } = await supabase.from('wst_quote_pool').delete().eq('game_id', gameId)
  if (poolError) return NextResponse.json({ error: poolError.message }, { status: 500 })

  const { error: pqError } = await supabase.from('player_questions').delete().eq('game_id', gameId)
  if (pqError) return NextResponse.json({ error: pqError.message }, { status: 500 })

  const { error: playerNamesError } = await supabase
    .from('participants')
    .delete()
    .eq('game_id', gameId)
    .not('submitted_by_player_id', 'is', null)
  if (playerNamesError) return NextResponse.json({ error: playerNamesError.message }, { status: 500 })

  const { error: hotSeatError } = await supabase.from('hot_seat_submissions').delete().eq('game_id', gameId)
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

  if (isBingoGame(gameType)) {
    const { error: clearError } = await clearBingoSessionData(supabase, gameId)
    if (clearError) return NextResponse.json({ error: clearError }, { status: 500 })
  }

  const { data: updated, error: gameError } = await supabase
    .from('games')
    .update(gameUpdate)
    .eq('id', gameId)
    .select()
    .single()

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true, game: updated })
}
