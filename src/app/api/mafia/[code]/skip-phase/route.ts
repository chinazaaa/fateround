import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'
import { runMafiaAdvance } from '../advance/route'

/**
 * Lets the town vote to skip ahead out of Discussion or Voting early instead of always
 * waiting out the full timer — same majority threshold as a lynch vote (floor(alive/2)+1).
 * Toggles the caller's own skip request; once enough alive players have requested it, the
 * phase advances immediately via the same resolution path as a natural timer expiry.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()
  const admin = getSupabaseAdmin()

  let body: { resumeToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (typeof body.resumeToken !== 'string') {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const auth = await assertPlayer(admin, gameId, body.resumeToken)
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
  const playerStates = mafiaPlayerStates as MafiaPlayerState[]

  if (session.phase !== 'day' && session.phase !== 'voting') {
    return NextResponse.json({ error: 'Cannot skip ahead right now' }, { status: 400 })
  }

  const myState = playerStates.find((p) => p.player_id === playerId)
  if (!myState || !myState.is_alive) {
    return NextResponse.json({ error: 'Only living players can vote to skip' }, { status: 400 })
  }

  const existing = session.skip_requested_player_ids ?? []
  if (existing.includes(playerId)) {
    return NextResponse.json({ success: true, skipRequestCount: existing.length })
  }
  const nextSkipIds = [...existing, playerId]

  // Guard with the current phase so a request racing a natural/other-triggered transition
  // doesn't stamp a stale skip tally onto the next phase.
  const { error: updateError, data: updatedSession } = await admin
    .from('mafia_sessions')
    .update({ skip_requested_player_ids: nextSkipIds })
    .eq('game_id', gameId)
    .eq('phase', session.phase)
    .select('phase')

  if (updateError) {
    console.error('Failed to record skip request:', updateError)
    return NextResponse.json({ error: 'Failed to record skip request' }, { status: 500 })
  }

  if (!updatedSession || updatedSession.length === 0) {
    // Phase already moved on — nothing to skip anymore.
    return NextResponse.json({ success: true, skipRequestCount: existing.length })
  }

  const aliveCount = playerStates.filter((p) => p.is_alive).length
  const skipRequired = Math.floor(aliveCount / 2) + 1

  if (nextSkipIds.length >= skipRequired) {
    const result = await runMafiaAdvance(gameId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
  }

  return NextResponse.json({ success: true, skipRequestCount: nextSkipIds.length })
}
