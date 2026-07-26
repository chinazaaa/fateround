import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import type { MafiaPlayerState, MafiaSession } from '@/types'
import { runMafiaAdvance } from '@/lib/mafia-advance'

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

  // Atomic append via a single UPDATE statement (array_append) — concurrent skip requests
  // serialize under Postgres row-level locking instead of racing a read-modify-write in
  // application code, which could silently drop an append or let two requests both believe
  // they hit the majority threshold and each trigger a phase advance.
  const { data: appended, error: rpcError } = await admin.rpc('mafia_append_skip_request', {
    p_game_id: gameId,
    p_phase: session.phase,
    p_player_id: playerId,
  })

  if (rpcError) {
    console.error('Failed to record skip request:', rpcError)
    return NextResponse.json({ error: 'Failed to record skip request' }, { status: 500 })
  }

  if (!appended) {
    // Either the phase already moved on, or this player already requested a skip — a cheap
    // follow-up read distinguishes the two only for an accurate response, no retry needed.
    const { data: current } = await admin
      .from('mafia_sessions')
      .select('phase, skip_requested_player_ids')
      .eq('game_id', gameId)
      .maybeSingle()
    const count = current?.skip_requested_player_ids?.length ?? 0
    return NextResponse.json({ success: true, skipRequestCount: count })
  }

  const nextSkipIds = appended as string[]
  const aliveCount = playerStates.filter((p) => p.is_alive).length
  const skipRequired = Math.floor(aliveCount / 2) + 1

  // Narrate the skip tally in the town chat feed, matching Wolvesville: "Somebody voted..."
  // for the first vote, then "All but N voted..." as N more votes are still needed to hit
  // the majority THRESHOLD (skipRequired) — not how many of all alive players haven't
  // voted, which is a different (larger) number and reads as inconsistent with the "X/Y"
  // count shown on the Skip button itself. Read by everyone (scope 'day', no target).
  const phaseLabel = session.phase === 'day' ? 'discussion' : 'voting'
  const stillNeeded = skipRequired - nextSkipIds.length
  await admin.from('mafia_chat_messages').insert({
    game_id: gameId,
    sender_player_id: 'system',
    sender_name: '📢',
    message:
      nextSkipIds.length === 1
        ? `Somebody voted to skip the ${phaseLabel} phase.`
        : `All but ${stillNeeded} voted to skip the ${phaseLabel} phase.`,
    scope: 'day',
  })

  if (nextSkipIds.length >= skipRequired) {
    // Resolves on whatever's been voted so far — a majority actually voting for the same
    // target still eliminates them even though skip ended Voting early.
    const result = await runMafiaAdvance(gameId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
  }

  return NextResponse.json({ success: true, skipRequestCount: nextSkipIds.length })
}
