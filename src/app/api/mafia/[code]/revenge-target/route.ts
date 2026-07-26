import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown; targetPlayerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, targetPlayerId } = body
  if (typeof resumeToken !== 'string' || typeof targetPlayerId !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const auth = await assertPlayer(admin, gameId, resumeToken)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const playerId = auth.player.id

  const [{ data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  if (session.phase === 'game_over' || session.phase === 'role_reveal') {
    return NextResponse.json({ error: 'Cannot set revenge target in this phase' }, { status: 400 })
  }

  const playerStates = mafiaPlayerStates as MafiaPlayerState[]
  const myState = playerStates.find((p) => p.player_id === playerId)
  if (!myState || !myState.is_alive || myState.role !== 'wolf_cub') {
    return NextResponse.json({ error: 'Only an alive Junior Mafia can set a revenge target' }, { status: 403 })
  }

  const targetState = playerStates.find((p) => p.player_id === targetPlayerId)
  if (!targetState || !targetState.is_alive) {
    return NextResponse.json({ error: 'Target must be an alive player' }, { status: 400 })
  }
  if (targetPlayerId === playerId) {
    return NextResponse.json({ error: 'Cannot target yourself' }, { status: 400 })
  }

  await admin
    .from('mafia_player_states')
    .update({ wolf_cub_revenge_target_player_id: targetPlayerId })
    .eq('id', myState.id)

  return NextResponse.json({ success: true })
}
