import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { quiplashAnswerSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isQuiplashGame } from '@/lib/game-types'
import { QUIPLASH_MAX_ANSWER_LENGTH } from '@/lib/quiplash'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, quiplashAnswerSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, text } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuiplashGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Punchline game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: session } = await supabase.from('quiplash_sessions').select('phase').eq('game_id', code).maybeSingle()
  if (!session || session.phase !== 'writing') {
    return NextResponse.json({ error: 'Not accepting answers right now' }, { status: 400 })
  }

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (auth.player.spectator === true || auth.player.is_eliminated === true) {
    return NextResponse.json({ error: 'Spectators cannot submit answers' }, { status: 403 })
  }

  const trimmed = text.trim().slice(0, QUIPLASH_MAX_ANSWER_LENGTH)
  if (!trimmed) return NextResponse.json({ error: 'Answer cannot be empty' }, { status: 400 })

  const { data: existing } = await supabase
    .from('quiplash_answers')
    .select('id')
    .eq('player_id', playerId)
    .eq('round_id', roundId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already submitted this round' }, { status: 400 })

  const { error } = await supabase.from('quiplash_answers').insert({
    game_id: code,
    round_id: roundId,
    player_id: playerId,
    text: trimmed,
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('quiplash/answer', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
