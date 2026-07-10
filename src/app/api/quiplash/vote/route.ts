import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { quiplashVoteSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isQuiplashGame } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, quiplashVoteSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, chosenAnswerId } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuiplashGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quiplash game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: session } = await supabase.from('quiplash_sessions').select('phase').eq('game_id', code).maybeSingle()
  if (!session || session.phase !== 'voting') {
    return NextResponse.json({ error: 'This round is not open for voting' }, { status: 400 })
  }

  const { data: round } = await supabase
    .from('rounds')
    .select('id, status')
    .eq('id', roundId)
    .eq('game_id', code)
    .maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const { data: chosenAnswer } = await supabase
    .from('quiplash_answers')
    .select('id, player_id, round_id')
    .eq('id', chosenAnswerId)
    .eq('round_id', roundId)
    .maybeSingle()
  if (!chosenAnswer) {
    return NextResponse.json({ error: 'Invalid answer choice' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (auth.player.spectator === true || auth.player.is_eliminated === true) {
    return NextResponse.json({ error: 'Spectators cannot vote' }, { status: 403 })
  }

  if (chosenAnswer.player_id === playerId) {
    return NextResponse.json({ error: 'You cannot vote for your own answer' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('quiplash_votes')
    .select('id')
    .eq('player_id', playerId)
    .eq('round_id', roundId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already voted this round' }, { status: 400 })

  const { error } = await supabase.from('quiplash_votes').insert({
    game_id: code,
    round_id: roundId,
    battle_id: null,
    player_id: playerId,
    chosen_answer_id: chosenAnswerId,
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('quiplash/vote', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
