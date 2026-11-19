import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, trimNpatAnswerFields, validateNpatAnswerFields } from '@/lib/npat'
import { npatDraftSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { playerIsViewer } from '@/lib/viewers'

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, npatDraftSchema)
  if (bodyError) return bodyError

  const { gameId, resumeToken, roundId, name, animal, place, thing, food } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isICallOnGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an I Call On game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'writing') {
    return NextResponse.json({ error: 'Not in writing phase' }, { status: 400 })
  }

  const trimmed = trimNpatAnswerFields({ name, animal, place, thing, food })
  const validationError = validateNpatAnswerFields(metadata.letter, trimmed)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (playerIsViewer(auth.player, game)) {
    return NextResponse.json({ error: 'Spectators cannot submit answers' }, { status: 403 })
  }

  // A draft only lands on an unsubmitted row: the check is inside the database write, so a draft
  // racing a submit cannot overwrite the submitted answers.
  const { error } = await supabase.rpc('npat_save_answer', {
    p_game_id: code,
    p_round_id: roundId,
    p_player_id: auth.player.id,
    p_name: trimmed.name,
    p_animal: trimmed.animal,
    p_place: trimmed.place,
    p_thing: trimmed.thing,
    p_food: trimmed.food,
    p_submit: false,
    p_now: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: internalErrorMessage('npat/draft', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
