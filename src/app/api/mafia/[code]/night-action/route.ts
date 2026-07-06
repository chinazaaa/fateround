import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown, targetPlayerId?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { resumeToken, targetPlayerId } = body
  if (typeof resumeToken !== 'string' || typeof targetPlayerId !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // 1. Authenticate player
  const auth = await assertPlayer(admin, gameId, resumeToken)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const playerId = auth.player.id

  // 2. Fetch mafia session and target states
  const [{ data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  if (session.phase !== 'night') {
    return NextResponse.json({ error: 'It is not night' }, { status: 400 })
  }

  const myState = playerStates.find(p => p.player_id === playerId)
  if (!myState) {
    return NextResponse.json({ error: 'Player state not found' }, { status: 404 })
  }

  if (!myState.is_alive) {
    return NextResponse.json({ error: 'You are dead' }, { status: 400 })
  }

  if (myState.role === 'villager') {
    return NextResponse.json({ error: 'Villagers have no night actions' }, { status: 400 })
  }

  const targetState = playerStates.find(p => p.player_id === targetPlayerId)
  if (!targetState) {
    return NextResponse.json({ error: 'Target player not found' }, { status: 404 })
  }

  if (!targetState.is_alive) {
    return NextResponse.json({ error: 'Target player is already dead' }, { status: 400 })
  }

  // Enforce no self-heal for Doctor
  if (myState.role === 'doctor' && targetPlayerId === playerId) {
    return NextResponse.json({ error: 'Doctor cannot heal themselves' }, { status: 400 })
  }

  // 3. Update the player's night action target
  const { error: updateError } = await admin
    .from('mafia_player_states')
    .update({ night_action_target_player_id: targetPlayerId })
    .eq('id', myState.id)

  if (updateError) {
    console.error('Failed to update night action:', updateError)
    return NextResponse.json({ error: 'Failed to submit night action' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
