import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isNamePlaceAnimalThingGame, parseGameType } from '@/lib/game-types'
import { answerStartsWithLetter, availableLettersForPick, NPAT_MAX_ANSWER_LENGTH, parseNpatMetadata } from '@/lib/npat'
import { npatSubmitSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

function trimField(value: string): string {
  return value.trim().slice(0, NPAT_MAX_ANSWER_LENGTH)
}

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = npatSubmitSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, roundId, name, animal, place, thing } = parsed.data
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
  if (!metadata || metadata.phase !== 'writing') {
    return NextResponse.json({ error: 'Not in writing phase' }, { status: 400 })
  }

  const letter = metadata.letter
  const fields = { name, animal, place, thing }
  for (const [label, value] of Object.entries(fields)) {
    const trimmed = trimField(value)
    if (trimmed && letter && !answerStartsWithLetter(trimmed, letter)) {
      return NextResponse.json(
        { error: `${label} must start with the letter ${letter}` },
        { status: 400 }
      )
    }
  }

  const { data: player } = await supabase.from('players').select('id').eq('id', playerId).eq('game_id', code).maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const now = new Date().toISOString()
  const payload = {
    game_id: code,
    round_id: roundId,
    player_id: playerId,
    name: trimField(name),
    animal: trimField(animal),
    place: trimField(place),
    thing: trimField(thing),
    submitted_at: now,
  }

  const { error } = await supabase.from('npat_answers').upsert(payload, { onConflict: 'player_id,round_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
