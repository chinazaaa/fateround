import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeGender, normalizePlayerGender } from '@/lib/participants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { gameCode, playerName, gender: rawGender } = await req.json()

  if (!gameCode || !playerName?.trim()) {
    return NextResponse.json({ error: 'gameCode and playerName are required' }, { status: 400 })
  }

  const gender = normalizePlayerGender(String(rawGender ?? ''))
  if (!gender) {
    return NextResponse.json({ error: 'Please select male, female, or both' }, { status: 400 })
  }

  const name = playerName.trim()
  const id = gameCode.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('status, participant_mode')
    .eq('id', id)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Game has already started' }, { status: 400 })
  }

  const { data: existingPlayers } = await supabase
    .from('players')
    .select('id, name')
    .eq('game_id', id)

  if (existingPlayers?.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: 'That name is already taken in this game' }, { status: 400 })
  }

  if (game.participant_mode === 'joiners') {
    if (gender === 'both') {
      return NextResponse.json(
        { error: 'Pick male or female to join the game — both is for voters only' },
        { status: 400 }
      )
    }
    const displayOrder = existingPlayers?.length ?? 0

    const { data: participant, error: partError } = await supabase
      .from('participants')
      .insert({
        game_id: id,
        name,
        gender,
        display_order: displayOrder,
      })
      .select()
      .single()

    if (partError) return NextResponse.json({ error: partError.message }, { status: 500 })

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ game_id: id, name, gender })
      .select()
      .single()

    if (playerError) {
      await supabase.from('participants').delete().eq('id', participant.id)
      return NextResponse.json({ error: playerError.message }, { status: 500 })
    }

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      playerGender: player.gender,
    })
  }

  const { data: player, error } = await supabase
    .from('players')
    .insert({ game_id: id, name, gender })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    playerId: player.id,
    playerName: player.name,
    playerGender: player.gender,
  })
}
