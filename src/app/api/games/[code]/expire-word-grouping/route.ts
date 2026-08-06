import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isWordGroupingGame } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

function wordGroupingSessionExpired(sessionStartedAt: string | null, durationSeconds: number | null): boolean {
  if (!sessionStartedAt || !durationSeconds || durationSeconds <= 0) return false
  const elapsed = (Date.now() - new Date(sessionStartedAt).getTime()) / 1000
  return elapsed > durationSeconds + 5
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, game_duration_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWordGroupingGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Grouping game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!wordGroupingSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const { error } = await supabase
    .from('games')
    .update({ status: 'finished', finished_at: new Date().toISOString() })
    .eq('id', gameId)

  if (error) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
