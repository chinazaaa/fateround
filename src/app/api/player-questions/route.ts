import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseGameType, isBinaryChoiceGame, isMostLikelyTo, isNeverHaveIEver, isPickANumber } from '@/lib/game-types'
import { lobbyAllowsPlayerQuestions } from '@/lib/player-question-pool'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').trim()

const submitQuestionSchema = z.object({
  gameId: z.string().min(1),
  resumeToken: z.string().min(4),
  questionType: z.enum(['wyr', 'mlt']),
  optionA: z.string().max(200).optional(),
  optionB: z.string().max(200).optional(),
  questionText: z.string().max(200).optional(),
})

const deleteQuestionSchema = z.object({
  questionId: z.string().uuid(),
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, submitQuestionSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, questionType, optionA, optionB, questionText } = body
  const upperGameId = gameId.toUpperCase()

  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('status, game_type, player_questions_enabled')
    .eq('id', upperGameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Questions can only be submitted before the game starts' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player is authoritative (the client
  // no longer supplies its own playerId).
  const auth = await assertPlayer(supabase, upperGameId, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  const gameType = parseGameType(game.game_type)
  if (!lobbyAllowsPlayerQuestions(game)) {
    return NextResponse.json({ error: 'Player question submissions are disabled for this game' }, { status: 400 })
  }

  // Rate limit: max 10 questions per player per game
  const { count } = await supabase
    .from('player_questions')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', upperGameId)
    .eq('player_id', playerId)
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: 'You can submit up to 10 questions per game' }, { status: 400 })
  }

  if (questionType === 'wyr' && !isBinaryChoiceGame(gameType)) {
    return NextResponse.json({ error: 'This game type does not accept A/B questions' }, { status: 400 })
  }
  if (questionType === 'mlt' && !isMostLikelyTo(gameType) && !isNeverHaveIEver(gameType) && !isPickANumber(gameType)) {
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

  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('player_questions')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, deleteQuestionSchema)
  if (bodyError) return bodyError

  const { questionId, resumeToken } = body

  const supabase = getSupabaseAdmin()

  const { data: question } = await supabase
    .from('player_questions')
    .select('id, player_id, game_id')
    .eq('id', questionId)
    .maybeSingle()

  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  // Authorize by the secret resume_token against the question's own game; a player may
  // only delete their OWN question. The resolved player id is authoritative.
  const auth = await assertPlayer(supabase, question.game_id, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (question.player_id !== auth.player.id) {
    return NextResponse.json({ error: 'You can only delete your own questions' }, { status: 403 })
  }

  const { error } = await supabase.from('player_questions').delete().eq('id', questionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
