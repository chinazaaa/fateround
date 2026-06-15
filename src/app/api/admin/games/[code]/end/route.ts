import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { isAnonymousMessagesGame, isSecretMessageGame, isBingoGame, parseGameType } from '@/lib/game-types'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('id, status, game_type').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active' && game.status !== 'waiting') {
    return NextResponse.json({ error: 'Only waiting or active games can be ended' }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error: roundError } = await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('game_id', gameId)
    .eq('status', 'active')

  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

  if (isAnonymousMessagesGame(parseGameType(game.game_type))) {
    const { error } = await finishAnonymousRoomSession(supabase, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isSecretMessageGame(parseGameType(game.game_type))) {
    const { error } = await finishSecretMessageBoard(supabase, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isBingoGame(parseGameType(game.game_type))) {
    const { error } = await supabase.from('games').update({ status: 'finished' }).eq('id', gameId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const { error: gameError } = await supabase.from('games').update({ status: 'finished' }).eq('id', gameId)
  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
