import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertHostTransfer } from '@/lib/game-admin'

/**
 * Host nominates a player to take over as host (claim-based transfer). Authorized by the
 * CURRENT host token. This only records the nomination (games.pending_host_player_id) — no
 * token is minted or moved here. The nominated player completes the handoff by calling
 * /api/games/[code]/claim-host with their own resume_token.
 *
 * Passing a null/empty playerId cancels a pending nomination.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  let body: { hostToken?: unknown; playerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  const playerId = typeof body?.playerId === 'string' && body.playerId.trim() ? body.playerId.trim() : null

  const supabase = getSupabaseAdmin()
  const auth = await assertHostTransfer(supabase, code, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gameId = auth.id

  if (playerId) {
    // The nominee must be a real, non-spectator player in this game.
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, spectator')
      .eq('game_id', gameId)
      .eq('id', playerId)
      .maybeSingle()
    // A lookup failure must not masquerade as "player not found" — surface it as a 500.
    if (playerError) return NextResponse.json({ error: 'Failed to look up player' }, { status: 500 })
    if (!player) return NextResponse.json({ error: 'Player not found in this game' }, { status: 404 })
    if (player.spectator) {
      return NextResponse.json({ error: 'Cannot transfer host to a spectator' }, { status: 400 })
    }
  }

  const { error } = await supabase.from('games').update({ pending_host_player_id: playerId }).eq('id', gameId)
  if (error) return NextResponse.json({ error: 'Failed to update nomination' }, { status: 500 })

  return NextResponse.json({ ok: true, pendingHostPlayerId: playerId }, { status: 200 })
}
