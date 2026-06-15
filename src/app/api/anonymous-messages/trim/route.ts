import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseGameType, isMessageInboxGame } from '@/lib/game-types'
import { trimAnonymousMessagesIfDue } from '@/lib/anonymous-messages'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({}))
  const gameId = String(raw.gameId ?? '').toUpperCase()
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })

  const { data: game } = await supabase.from('games').select('status, game_type').eq('id', gameId).maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isMessageInboxGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a message board' }, { status: 400 })
  }
  if (game.status !== 'active') {
    return NextResponse.json({ trimmed: 0 })
  }

  const { trimmed } = await trimAnonymousMessagesIfDue(supabase, gameId)
  return NextResponse.json({ trimmed })
}
