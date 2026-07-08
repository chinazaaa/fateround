import { NextRequest, NextResponse } from 'next/server'
import { parseGameType, isMatchingPairsGame } from '@/lib/game-types'
import { markGameFinished } from '@/lib/game-finish'
import { matchingPairsGameSessionExpired } from '@/lib/memory-match'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at, timer_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isMatchingPairsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Matching Pairs game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!matchingPairsGameSessionExpired(game.session_started_at, game.timer_seconds)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const { error } = await markGameFinished(supabase, gameId, undefined, { onlyIfActive: true })
  if (error) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
