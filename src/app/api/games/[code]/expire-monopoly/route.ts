import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isMonopolyGame } from '@/lib/game-types'
import { finishExpiredMonopolyGame, monopolyGameSessionExpired } from '@/lib/monopoly'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

// System/timer route: any client may poke it, but it only finishes the game once
// the session duration has genuinely elapsed (enforced via
// monopolyGameSessionExpired), so there's no per-player token to authorize.
// Writes go through the service role.
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
  if (!isMonopolyGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Monopoly game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!monopolyGameSessionExpired(game.session_started_at, game.game_duration_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const finished = await finishExpiredMonopolyGame(supabase, game)
  if (!finished) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
