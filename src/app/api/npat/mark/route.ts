import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isNamePlaceAnimalThingGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, reviewTargetForMarker, answerStartsWithLetter, normalizeAnswer, duplicateKeysByCategory } from '@/lib/npat'
import { npatMarkSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = npatMarkSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, roundId, validName, validAnimal, validPlace, validThing } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isNamePlaceAnimalThingGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Name Place Animal Thing game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'marking') {
    return NextResponse.json({ error: 'Not in marking phase' }, { status: 400 })
  }

  const targetId = reviewTargetForMarker(metadata, playerId)
  if (!targetId) return NextResponse.json({ error: 'No review assignment for this player' }, { status: 400 })

  const { data: targetAnswer } = await supabase
    .from('npat_answers')
    .select('name, animal, place, thing')
    .eq('round_id', roundId)
    .eq('player_id', targetId)
    .maybeSingle()

  const letter = metadata.letter
  const dupes = duplicateKeysByCategory(targetAnswer ? [targetAnswer] : [])
  const clampValid = (category: 'name' | 'animal' | 'place' | 'thing', requested: boolean) => {
    if (!targetAnswer) return false
    const text = targetAnswer[category]
    const normalized = normalizeAnswer(text)
    const isDuplicate = normalized ? dupes[category].has(normalized) : false
    if (!normalized) return false
    if (letter && !answerStartsWithLetter(text, letter)) return false
    if (isDuplicate) return false
    return requested
  }

  const { data: player } = await supabase.from('players').select('id').eq('id', playerId).eq('game_id', code).maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const now = new Date().toISOString()
  const { error } = await supabase.from('npat_marks').upsert(
    {
      game_id: code,
      round_id: roundId,
      marker_player_id: playerId,
      target_player_id: targetId,
      valid_name: clampValid('name', validName),
      valid_animal: clampValid('animal', validAnimal),
      valid_place: clampValid('place', validPlace),
      valid_thing: clampValid('thing', validThing),
      marked_at: now,
    },
    { onConflict: 'marker_player_id,round_id' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
