import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isNamePlaceAnimalThingGame, parseGameType } from '@/lib/game-types'
import { parseNpatMetadata, unusedLetters } from '@/lib/npat'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const LETTER_RE = /^[A-Za-z]$/

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const gameId = typeof raw.gameId === 'string' ? raw.gameId.toUpperCase() : ''
  const playerId = typeof raw.playerId === 'string' ? raw.playerId : ''
  const roundId = typeof raw.roundId === 'string' ? raw.roundId : ''
  const letter = typeof raw.letter === 'string' ? raw.letter.trim().toUpperCase() : ''

  if (!gameId || !playerId || !roundId || !LETTER_RE.test(letter)) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isNamePlaceAnimalThingGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Name Place Animal Thing game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', gameId).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }
  if (round.submitter_player_id !== playerId) {
    return NextResponse.json({ error: 'Only the letter caller can pick the letter' }, { status: 403 })
  }

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'letter_pick') {
    return NextResponse.json({ error: 'Not in letter pick phase' }, { status: 400 })
  }

  const available = unusedLetters(metadata.used_letters)
  if (!available.includes(letter)) {
    return NextResponse.json({ error: 'That letter was already used' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('rounds')
    .update({
      npat_metadata: {
        ...metadata,
        letter,
        phase: 'writing',
        phase_started_at: now,
      },
    })
    .eq('id', roundId)
    .eq('status', 'active')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, letter })
}
