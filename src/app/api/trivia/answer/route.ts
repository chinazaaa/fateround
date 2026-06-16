import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { triviaAnswerSchema } from '@/lib/validation'
import { parseGameType, isTriviaGame } from '@/lib/game-types'
import { computeTriviaPoints, parseTriviaMetadata, TRIVIA_DEFAULT_TIMER } from '@/lib/trivia'
import { playerIsViewer } from '@/lib/viewers'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = triviaAnswerSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, roundId, choiceIndex } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isTriviaGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a trivia game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseTriviaMetadata(round.trivia_metadata)
  if (!metadata) return NextResponse.json({ error: 'Invalid question data' }, { status: 400 })
  if (choiceIndex < 0 || choiceIndex >= metadata.choices.length) {
    return NextResponse.json({ error: 'Invalid choice' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('trivia_answers')
    .select('id')
    .eq('player_id', playerId)
    .eq('round_id', roundId)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: 'Already answered this round' }, { status: 400 })

  const { data: player } = await supabase
    .from('players')
    .select('id, joined_at, spectator')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  if (playerIsViewer(player, game)) {
    return NextResponse.json({ error: 'Viewers cannot answer questions' }, { status: 403 })
  }

  const startedAt = round.started_at ? new Date(round.started_at).getTime() : Date.now()
  const now = Date.now()
  const timerMs = (game.timer_seconds ?? TRIVIA_DEFAULT_TIMER) * 1000
  const responseMs = Math.max(0, Math.min(now - startedAt, timerMs))

  const isCorrect = choiceIndex === metadata.correct_index

  const { count: priorCorrectCount } = await supabase
    .from('trivia_answers')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)
    .eq('is_correct', true)

  const isFirstCorrect = isCorrect && (priorCorrectCount ?? 0) === 0
  const points = computeTriviaPoints({ isCorrect, responseMs, timerMs, isFirstCorrect })

  const { data: inserted, error } = await supabase
    .from('trivia_answers')
    .insert({
      game_id: code,
      round_id: roundId,
      player_id: playerId,
      choice_index: choiceIndex,
      is_correct: isCorrect,
      response_ms: responseMs,
      points,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    isCorrect,
    points,
    correctIndex: metadata.correct_index,
    answer: inserted,
  })
}
