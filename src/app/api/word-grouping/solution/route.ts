import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const gameId = new URL(req.url).searchParams.get('gameId')?.toUpperCase()
  if (!gameId) return NextResponse.json({ error: 'Missing gameId' }, { status: 400 })
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('id, status').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'finished') return NextResponse.json({ error: 'Game not finished' }, { status: 403 })

  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', 1)
    .maybeSingle()
  if (!round) return NextResponse.json({ solution: null })

  const { data: sol } = await supabase
    .from('word_grouping_solutions')
    .select('solution')
    .eq('round_id', round.id)
    .maybeSingle()

  return NextResponse.json({ solution: sol?.solution ?? null })
}
