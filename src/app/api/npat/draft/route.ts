import { NextRequest, NextResponse } from 'next/server'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, trimNpatAnswerFields, validateNpatAnswerFields } from '@/lib/npat'
import { npatDraftSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { parseJsonBody } from '@/lib/parse-body'

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

  const { data: existing } = await supabase
    .from('npat_answers')
    .select('submitted_at')
    .eq('round_id', roundId)
    .eq('player_id', auth.player.id)
    .maybeSingle()

  if (existing?.submitted_at) return NextResponse.json({ success: true })

  const payload = {
    game_id: code,
    round_id: roundId,
    player_id: auth.player.id,
    ...trimmed,
  }

  const { error } = await supabase.from('npat_answers').upsert(payload, { onConflict: 'player_id,round_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
