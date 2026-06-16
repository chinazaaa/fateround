import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertHostGameSettings } from '@/lib/game-admin'
import { questionPoolCap } from '@/lib/custom-questions'
import { parseTimerSeconds, updateGameSchema } from '@/lib/validation'
import {
  parseGameType,
  isHotSeat,
  isPairGame,
  parsePairVoteMode,
  isBinaryChoiceGame,
  isMostLikelyTo,
  isCodewordsGame,
} from '@/lib/game-types'
import { isCustomTwoSlotGame } from '@/lib/custom-game'
import { clampHotSeatMaxCap, hotSeatJoinedPlayers, hotSeatMaxCapUpperBound } from '@/lib/hot-seat'
import { parsePlayerQuestionsEnabled, parsePlayerQuestionsOrder } from '@/lib/player-question-pool'
import { supportsPlayerNameSubmissions } from '@/lib/player-participant-pool'
import { gameSupportsViewerSetting, lateJoinPolicyToFields } from '@/lib/viewers'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = updateGameSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, rounds_count: rawRoundsCount, timer_seconds: rawTimerSeconds, participant_filter } = parsed.data

  const auth = await assertHostGameSettings(supabase, code, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const updatePayload: Record<string, unknown> = {}

  if (rawRoundsCount !== undefined) {
    const gameType = parseGameType(auth.game!.game_type)
    const min = isHotSeat(gameType) ? 3 : 1
    let rounds_count: number

    if (isHotSeat(gameType)) {
      const [{ data: playersData }, { data: participantsData }] = await Promise.all([
        supabase.from('players').select('id, participant_id, name').eq('game_id', auth.id),
        supabase.from('participants').select('id, name').eq('game_id', auth.id),
      ])
      const joinedCount = hotSeatJoinedPlayers(
        playersData ?? [],
        participantsData ?? [],
        auth.game!.participant_mode
      ).length
      const upper = hotSeatMaxCapUpperBound(joinedCount, participantsData?.length ?? 0)
      rounds_count = clampHotSeatMaxCap(rawRoundsCount, upper)
    } else {
      let cap = questionPoolCap(auth.game!)
      if (isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType)) {
        const questionType = isMostLikelyTo(gameType) ? 'mlt' : 'wyr'
        const { count } = await supabase
          .from('player_questions')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', auth.id)
          .eq('question_type', questionType)
        cap = questionPoolCap(auth.game!, count ?? 0)
      }
      if (rawRoundsCount > cap) {
        return NextResponse.json({ error: `Too many rounds — pick ${cap} or fewer` }, { status: 400 })
      }
      rounds_count = Math.min(Math.max(rawRoundsCount, min), cap)
    }

    updatePayload.rounds_count = rounds_count
  }

  if (rawTimerSeconds !== undefined) {
    updatePayload.timer_seconds = parseTimerSeconds(rawTimerSeconds)
  }

  if (participant_filter !== undefined) {
    updatePayload.participant_filter = participant_filter === 'joined' ? 'joined' : 'all'
  }

  if (parsed.data.gender_based !== undefined) {
    return NextResponse.json(
      { error: "Who's in each round is set when the game is created — create a new game to change it" },
      { status: 400 }
    )
  }

  if (parsed.data.pair_vote_mode !== undefined) {
    const gameType = parseGameType(auth.game!.game_type)
    if (!isPairGame(gameType) && !isCustomTwoSlotGame(auth.game!)) {
      return NextResponse.json({ error: 'This game type does not support pair voting settings' }, { status: 400 })
    }
    updatePayload.pair_vote_mode = parsePairVoteMode(parsed.data.pair_vote_mode)
  }

  const gameType = parseGameType(auth.game!.game_type)
  const isLobbyQuestions = isBinaryChoiceGame(gameType) || isMostLikelyTo(gameType)
  const supportsPlayerSubmissions =
    isLobbyQuestions ||
    supportsPlayerNameSubmissions({ game_type: gameType, participant_mode: auth.game!.participant_mode })

  if (parsed.data.player_questions_enabled !== undefined) {
    if (!supportsPlayerSubmissions) {
      return NextResponse.json({ error: 'This game type does not support player submission settings' }, { status: 400 })
    }
    updatePayload.player_questions_enabled = parsePlayerQuestionsEnabled(parsed.data.player_questions_enabled)
  }

  if (parsed.data.player_questions_order !== undefined) {
    if (!supportsPlayerSubmissions) {
      return NextResponse.json({ error: 'This game type does not support player submission settings' }, { status: 400 })
    }
    updatePayload.player_questions_order = parsePlayerQuestionsOrder(parsed.data.player_questions_order)
  }

  if (parsed.data.late_join_policy !== undefined) {
    if (!gameSupportsViewerSetting(gameType)) {
      return NextResponse.json({ error: 'This game type does not support late join settings' }, { status: 400 })
    }
    const fields = lateJoinPolicyToFields(parsed.data.late_join_policy)
    updatePayload.allow_viewers = fields.allow_viewers
    updatePayload.allow_late_players = fields.allow_late_players
    if (isCodewordsGame(gameType)) {
      updatePayload.codewords_late_join = fields.allow_late_players
    }
  } else if (parsed.data.allow_viewers !== undefined || parsed.data.allow_late_players !== undefined) {
    if (!gameSupportsViewerSetting(gameType)) {
      return NextResponse.json({ error: 'This game type does not support late join settings' }, { status: 400 })
    }
    const allowViewersValue =
      parsed.data.allow_viewers !== undefined ? parsed.data.allow_viewers !== false : auth.game!.allow_viewers !== false
    const allowLatePlayersValue =
      parsed.data.allow_late_players !== undefined
        ? parsed.data.allow_late_players !== false
        : auth.game!.allow_late_players !== false
    updatePayload.allow_viewers = allowViewersValue
    updatePayload.allow_late_players = allowViewersValue && allowLatePlayersValue
    if (isCodewordsGame(gameType)) {
      updatePayload.codewords_late_join = updatePayload.allow_late_players
    }
  }

  if (
    isLobbyQuestions &&
    (parsed.data.player_questions_enabled !== undefined || parsed.data.player_questions_order !== undefined) &&
    rawRoundsCount === undefined
  ) {
    const nextGame = {
      ...auth.game!,
      player_questions_enabled:
        parsed.data.player_questions_enabled !== undefined
          ? parsePlayerQuestionsEnabled(parsed.data.player_questions_enabled)
          : auth.game!.player_questions_enabled,
      player_questions_order:
        parsed.data.player_questions_order !== undefined
          ? parsePlayerQuestionsOrder(parsed.data.player_questions_order)
          : auth.game!.player_questions_order,
    }
    const questionType = isMostLikelyTo(gameType) ? 'mlt' : 'wyr'
    const { count } = await supabase
      .from('player_questions')
      .select('*', { count: 'exact', head: true })
      .eq('game_id', auth.id)
      .eq('question_type', questionType)
    const cap = questionPoolCap(nextGame, count ?? 0)
    if (auth.game!.rounds_count > cap) {
      updatePayload.rounds_count = cap
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game, error } = await supabase.from('games').update(updatePayload).eq('id', auth.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ game })
}
