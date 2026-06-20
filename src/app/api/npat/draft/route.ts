import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isICallOnGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, trimNpatAnswerFields, validateNpatAnswerFields } from '@/lib/npat'
import { npatDraftSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = npatDraftSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, roundId, name, animal, place, thing, food } = parsed.data
  const code = gameId.toUpperCase()

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

  const { data: player } = await supabase.from('players').select('id').eq('id', playerId).eq('game_id', code).maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('npat_answers')
    .select('submitted_at')
    .eq('round_id', roundId)
    .eq('player_id', playerId)
    .maybeSingle()

  if (existing?.submitted_at) return NextResponse.json({ success: true })

  const payload = {
    game_id: code,
    round_id: roundId,
    player_id: playerId,
    ...trimmed,
  }

  const { error } = await supabase.from('npat_answers').upsert(payload, { onConflict: 'player_id,round_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
