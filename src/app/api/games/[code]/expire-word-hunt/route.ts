import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { parseGameType, isWordHuntGame } from '@/lib/game-types'
import { finishExpiredWordHuntGame, WORD_HUNT_EXPIRE_GRACE_MS, wordHuntSessionExpired } from '@/lib/word-hunt'

const supabase = getSupabaseAnon()

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
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
