import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import { normalizeGender, hasEnoughForRounds, participantsNeedGender, type ParticipantInput } from '@/lib/participants'
import { parseGameType, roundPoolSize, isLobbyGame, isWouldYouRather, isMostLikelyTo, isAnonymousGame } from '@/lib/game-types'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import type { ParticipantMode } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function parseParticipants(raw: unknown, gameType: ReturnType<typeof parseGameType>): ParticipantInput[] | null {
  if (!Array.isArray(raw)) return null

  const parsed: ParticipantInput[] = []
  const needGender = participantsNeedGender(gameType)
  for (const item of raw) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name) parsed.push({ name, gender: 'female' })
      continue
    }
    if (item && typeof item === 'object' && typeof item.name === 'string') {
      const name = item.name.trim()
      const gender = normalizeGender(String(item.gender ?? ''))
      if (name && gender) parsed.push({ name, gender })
      else if (name && !needGender) parsed.push({ name, gender: 'female' })
    }
  }
  return parsed
}

function lobbyMaxRounds(gameType: ReturnType<typeof parseGameType>): number {
  if (isWouldYouRather(gameType)) return WYR_QUESTION_COUNT
  if (isMostLikelyTo(gameType)) return MLT_QUESTION_COUNT
  return 20
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    title,
    rounds_count,
    timer_seconds,
    anonymous,
    auto_reveal,
    auto_submit_behavior,
    participant_mode: rawMode,
    game_type: rawGameType,
    participants: rawParticipants,
  } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Game name is required' }, { status: 400 })
  }

  const game_type = parseGameType(rawGameType)
  const participant_mode: ParticipantMode = isLobbyGame(game_type)
    ? 'joiners'
    : rawMode === 'joiners'
      ? 'joiners'
      : 'import'

  let participants: ParticipantInput[] = []
  if (participant_mode === 'import') {
    const parsed = parseParticipants(rawParticipants, game_type)
    if (!parsed || parsed.length < roundPoolSize(game_type)) {
      return NextResponse.json(
        { error: `At least ${roundPoolSize(game_type)} participants required` },
        { status: 400 }
      )
    }
    if (isMostLikelyTo(game_type)) {
      if (parsed.length < 2) {
        return NextResponse.json({ error: 'Need at least 2 names on the list' }, { status: 400 })
      }
    } else if (!hasEnoughForRounds(parsed, game_type)) {
      const min = roundPoolSize(game_type)
      return NextResponse.json(
        { error: `Need at least ${min} people of the same gender (male or female) for rounds` },
        { status: 400 }
      )
    }
    participants = parsed
  }

  const maxRounds = lobbyMaxRounds(game_type)

  let gameCode = generateGameCode()
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.from('games').select('id').eq('id', gameCode).maybeSingle()
    if (!data) break
    gameCode = generateGameCode()
  }

  const hostToken = generateToken()

  const { error: gameError } = await supabase.from('games').insert({
    id: gameCode,
    title: title.trim(),
    host_token: hostToken,
    rounds_count: Math.min(Math.max(Number(rounds_count) || 3, 1), maxRounds),
    timer_seconds: [15, 30, 60].includes(Number(timer_seconds)) ? Number(timer_seconds) : 30,
    anonymous: isAnonymousGame(game_type) ? true : Boolean(anonymous),
    auto_reveal: Boolean(auto_reveal),
    auto_submit_behavior: auto_submit_behavior === 'no_answer' ? 'no_answer' : 'random',
    participant_mode,
    game_type,
    status: 'waiting',
    current_round_number: 0,
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
