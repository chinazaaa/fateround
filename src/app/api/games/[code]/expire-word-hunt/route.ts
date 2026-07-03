import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseGameType, isWordHuntGame } from '@/lib/game-types'
import { finishExpiredWordHuntGame, WORD_HUNT_EXPIRE_GRACE_MS, wordHuntSessionExpired } from '@/lib/word-hunt'

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
    .select('id, status, game_type, session_started_at, timer_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isWordHuntGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Word Hunt game' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!wordHuntSessionExpired(game.session_started_at, game.timer_seconds, WORD_HUNT_EXPIRE_GRACE_MS)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const finished = await finishExpiredWordHuntGame(supabase, game, {
    graceMs: WORD_HUNT_EXPIRE_GRACE_MS,
  })
  if (!finished) return NextResponse.json({ error: 'Failed to end game' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
