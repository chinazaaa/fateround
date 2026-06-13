import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeGender } from '@/lib/participants'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { gameCode, playerName, gender: rawGender } = await req.json()

  if (!gameCode || !playerName?.trim()) {
    return NextResponse.json({ error: 'gameCode and playerName are required' }, { status: 400 })
  }

  const gender = normalizeGender(String(rawGender ?? ''))
  if (!gender) {
    return NextResponse.json({ error: 'Please select male or female' }, { status: 400 })
  }

  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameCode.toUpperCase())
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Game has already started' }, { status: 400 })
  }

  const { data: player, error } = await supabase
    .from('players')
    .insert({ game_id: gameCode.toUpperCase(), name: playerName.trim(), gender })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    playerId: player.id,
    playerName: player.name,
    playerGender: player.gender,
  })
}
