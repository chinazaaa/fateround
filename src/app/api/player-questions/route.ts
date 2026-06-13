import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { parseGameType, isWouldYouRather, isMostLikelyTo } from '@/lib/game-types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim()

const submitQuestionSchema = z.object({
  gameId: z.string().min(1),
  playerId: z.string().uuid(),
  questionType: z.enum(['wyr', 'mlt']),
  optionA: z.string().max(200).optional(),
  optionB: z.string().max(200).optional(),
  questionText: z.string().max(200).optional(),
})

const deleteQuestionSchema = z.object({
  questionId: z.string().uuid(),
  playerId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = submitQuestionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, questionType, optionA, optionB, questionText } = parsed.data
  const upperGameId = gameId.toUpperCase()

  const [{ data: game }, { data: player }] = await Promise.all([
    supabase.from('games').select('status, game_type').eq('id', upperGameId).maybeSingle(),
    supabase.from('players').select('id').eq('id', playerId).eq('game_id', upperGameId).maybeSingle(),
  ])

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!player) return NextResponse.json({ error: 'Player not found in this game' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Questions can only be submitted before the game starts' }, { status: 400 })
  }

  const gameType = parseGameType(game.game_type)

  // Rate limit: max 10 questions per player per game
  const { count } = await supabase
    .from('player_questions')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', upperGameId)
    .eq('player_id', playerId)
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'You can submit up to 10 questions per game' }, { status: 400 })
  }

  if (questionType === 'wyr' && !isWouldYouRather(gameType)) {
    return NextResponse.json({ error: 'This game type does not accept WYR questions' }, { status: 400 })
  }
  if (questionType === 'mlt' && !isMostLikelyTo(gameType)) {
    return NextResponse.json({ error: 'This game type does not accept MLT questions' }, { status: 400 })
  }

  if (questionType === 'wyr') {
    const a = stripHtml(optionA ?? '')
    const b = stripHtml(optionB ?? '')
    if (!a || !b) {
      return NextResponse.json({ error: 'Both Option A and Option B are required' }, { status: 400 })
    }
    const { data: created, error } = await supabase
      .from('player_questions')
      .insert({ game_id: upperGameId, player_id: playerId, question_type: 'wyr', option_a: a, option_b: b })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ question: created })
  }

  const text = stripHtml(questionText ?? '')
  if (!text) {
    return NextResponse.json({ error: 'Question text is required' }, { status: 400 })
  }
  const { data: created, error } = await supabase
    .from('player_questions')
    .insert({ game_id: upperGameId, player_id: playerId, question_type: 'mlt', question_text: text })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: created })
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('gameId')?.toUpperCase()
  if (!gameId) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('player_questions')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const raw = await req.json()
  const parsed = deleteQuestionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { questionId, playerId } = parsed.data

  const { data: question } = await supabase
    .from('player_questions')
    .select('id, player_id')
    .eq('id', questionId)
    .maybeSingle()

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  if (question.player_id !== playerId) {
    return NextResponse.json({ error: 'You can only delete your own questions' }, { status: 403 })
  }

  const { error } = await supabase.from('player_questions').delete().eq('id', questionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
