import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseGameType, isWhotGame } from '@/lib/game-types'
import { finishExpiredWhotGame, whotGameSessionExpired } from '@/lib/whot'

// Ending the game writes `games.status = 'finished'`. Since the core-gameplay RLS
// lockdown (20260628132823) locked `games` to SELECT-only for anon, that write must
// go through the service role, or it silently updates 0 rows and the game never ends.
// This route is safe to run unauthenticated: it only finishes a game whose timer has
// genuinely expired (verified server-side below), so there is nothing to forge.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const supabase = getSupabaseAdmin()
  const { code } = await params
  const gameId = code.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, game_duration_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWhotGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Whot game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!whotGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const finished = await finishExpiredWhotGame(supabase, game)
  if (!finished) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
