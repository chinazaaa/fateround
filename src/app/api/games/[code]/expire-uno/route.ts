import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isUnoGame } from '@/lib/game-types'
import { finishExpiredUnoGame } from '@/lib/uno'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  // Service role: the finalization write hits RLS read-only uno tables.
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, game_duration_seconds, uno_team_mode')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isUnoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an UNO game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }

  // Not gated on the deadline: a round that finished early (or an untimed one) can still have its games.status
  // flip pending, which the helper recovers before it applies the deadline guard.
  const outcome = await finishExpiredUnoGame(supabase, game)
  if (outcome === 'not_due') return NextResponse.json({ expired: false, finished: false })
  if (outcome === 'conflict') {
    return NextResponse.json({ error: 'The game changed while ending it — try again' }, { status: 409 })
  }
  if (outcome === 'error') return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
