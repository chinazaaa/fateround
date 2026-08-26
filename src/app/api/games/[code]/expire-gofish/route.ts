import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseGameType, isGoFishGame } from '@/lib/game-types'
import { finishExpiredGoFishGame } from '@/lib/gofish-server'
import { gofishGameSessionExpired } from '@/lib/gofish'

/**
 * Whole-game buzzer for Go Fish. Runs unauthenticated — the only mutation is
 * finishing a game whose duration has genuinely elapsed, which the server
 * re-verifies against `games.session_started_at + game_duration_seconds`.
 * Mirrors /api/games/[code]/expire-whot.
 */
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
  if (!isGoFishGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Go Fish game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!gofishGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const finished = await finishExpiredGoFishGame(supabase, gameId)
  if (!finished) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })
  return NextResponse.json({ expired: true, finished: true })
}
