import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseGameType, isAnonymousMessagesGame } from '@/lib/game-types'
import { anonymousSessionExpired, finishExpiredAnonymousSession } from '@/lib/anonymous-messages'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_type, session_started_at')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isAnonymousMessagesGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not an anonymous room' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ expired: false, finished: game.status === 'finished' })
  }
  if (!anonymousSessionExpired(game.session_started_at)) {
    return NextResponse.json({ expired: false, finished: false })
  }

  const finished = await finishExpiredAnonymousSession(supabase, game)
  if (!finished) return NextResponse.json({ error: 'Failed to end session' }, { status: 500 })

  return NextResponse.json({ expired: true, finished: true })
}
