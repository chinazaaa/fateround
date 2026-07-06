import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isMahjongGame, parseGameType } from '@/lib/game-types'
import { sanitizeMahjongPlayerStates, sanitizeMahjongSession } from '@/lib/mahjong'
import { verifyMahjongPlayerAccess } from '@/lib/mahjong-auth'
import type { MahjongPlayerState, MahjongSession } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const gameId = url.searchParams.get('gameId')?.trim().toUpperCase()
  const playerId = url.searchParams.get('playerId')?.trim() || null
  const resumeToken = url.searchParams.get('resumeToken')?.trim() || null

  if (!gameId || gameId.length < 4) {
    return NextResponse.json({ error: 'Invalid game id' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: game } = await supabase.from('games').select('game_type').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (!isMahjongGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Mahjong game' }, { status: 400 })
  }

  let visiblePlayerId: string | null = null
  if (playerId || resumeToken) {
    const allowed = await verifyMahjongPlayerAccess(supabase, gameId, playerId, resumeToken)
    if (!allowed) return NextResponse.json({ error: 'Invalid player session' }, { status: 403 })
    visiblePlayerId = playerId
  }

  const [sessionRes, statesRes] = await Promise.all([
    supabase.from('mahjong_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    supabase.from('mahjong_player_state').select('*').eq('game_id', gameId).order('player_order'),
  ])

  if (sessionRes.error) return NextResponse.json({ error: sessionRes.error.message }, { status: 500 })
  if (statesRes.error) return NextResponse.json({ error: statesRes.error.message }, { status: 500 })

  const session = sessionRes.data as MahjongSession | null
  const states = ((statesRes.data as MahjongPlayerState[]) ?? []) as MahjongPlayerState[]

  return NextResponse.json({
    session: sanitizeMahjongSession(session),
    states: sanitizeMahjongPlayerStates(states, visiblePlayerId),
  })
}
