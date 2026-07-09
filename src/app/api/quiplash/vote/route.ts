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

  const { gameId, resumeToken, battleId, chosenAnswerId } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isQuiplashGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Quiplash game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: session } = await supabase
    .from('quiplash_sessions')
    .select('phase, active_battle_id')
    .eq('game_id', code)
    .maybeSingle()
  if (!session || session.phase !== 'voting' || session.active_battle_id !== battleId) {
    return NextResponse.json({ error: 'This battle is not open for voting' }, { status: 400 })
  }

  const { data: battle } = await supabase.from('quiplash_battles').select('*').eq('id', battleId).maybeSingle()
  if (!battle || battle.status !== 'active') {
    return NextResponse.json({ error: 'Battle is not active' }, { status: 400 })
  }

  if (chosenAnswerId !== battle.answer_a_id && chosenAnswerId !== battle.answer_b_id) {
    return NextResponse.json({ error: 'Invalid answer choice' }, { status: 400 })
  }

  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const playerId = auth.player.id

  if (auth.player.spectator === true || auth.player.is_eliminated === true) {
    return NextResponse.json({ error: 'Spectators cannot vote' }, { status: 403 })
  }

  const { data: answers } = await supabase
    .from('quiplash_answers')
    .select('id, player_id')
    .in('id', [battle.answer_a_id, battle.answer_b_id])
  const ownAnswer = (answers ?? []).find((a) => a.player_id === playerId)
  if (ownAnswer) {
    return NextResponse.json({ error: 'You cannot vote in a battle that includes your answer' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('quiplash_votes')
    .select('id')
    .eq('player_id', playerId)
    .eq('battle_id', battleId)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'Already voted on this battle' }, { status: 400 })

  const { error } = await supabase.from('quiplash_votes').insert({
    game_id: code,
    battle_id: battleId,
    player_id: playerId,
    chosen_answer_id: chosenAnswerId,
  })

  if (error) return NextResponse.json({ error: internalErrorMessage('quiplash/vote', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
