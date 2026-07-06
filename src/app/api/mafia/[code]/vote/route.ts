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
  if (typeof resumeToken !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  // 1. Authenticate player
  const auth = await assertPlayer(admin, gameId, resumeToken)
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const playerId = auth.player.id

  // 2. Fetch session and states
  const [{ data: mafiaSession }, { data: mafiaPlayerStates }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !mafiaPlayerStates) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  const session = mafiaSession as MafiaSession
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  if (session.phase !== 'voting') {
    return NextResponse.json({ error: 'Voting is not active' }, { status: 400 })
  }

  const myState = playerStates.find(p => p.player_id === playerId)
  if (!myState) {
    return NextResponse.json({ error: 'Player state not found' }, { status: 404 })
  }

  if (!myState.is_alive) {
    return NextResponse.json({ error: 'You are dead and cannot vote' }, { status: 400 })
  }

  // If voting for a target, make sure they are alive and not the voter themselves
  let targetId: string | null = null
  if (typeof targetPlayerId === 'string' && targetPlayerId) {
    if (targetPlayerId === playerId) {
      return NextResponse.json({ error: 'Cannot vote for yourself' }, { status: 400 })
    }
    const targetState = playerStates.find(p => p.player_id === targetPlayerId)
    if (!targetState) {
      return NextResponse.json({ error: 'Target player not found' }, { status: 404 })
    }
    if (!targetState.is_alive) {
      return NextResponse.json({ error: 'Target player is dead' }, { status: 400 })
    }
    targetId = targetPlayerId
  }

  // 3. Update the player's vote
  const { error: updateError } = await admin
    .from('mafia_player_states')
    .update({ day_vote_target_player_id: targetId })
    .eq('id', myState.id)

  if (updateError) {
    console.error('Failed to submit vote:', updateError)
    return NextResponse.json({ error: 'Failed to submit vote' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
