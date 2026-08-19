import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Host nominates a tournament player to take over as host (claim-based transfer).
 * Authorised by the CURRENT host_token. Only records the nomination
 * (tournaments.pending_host_player_id) — no token is minted or rotated here.
 * The nominated player completes the handoff on their own device via
 * /api/tournaments/[code]/claim-host with their resume token.
 *
 * Passing a null/empty playerId cancels a pending nomination.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  let body: { hostToken?: unknown; playerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  const playerId = typeof body?.playerId === 'string' && body.playerId.trim() ? body.playerId.trim() : null
  if (!hostToken) return NextResponse.json({ error: 'Missing hostToken' }, { status: 400 })

  const supabase = getSupabaseAdmin()
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: "Can't transfer host of a finished tournament" }, { status: 400 })
  }

  if (playerId) {
    // The nominee must be a real, non-eliminated player in this tournament.
    // (An eliminated player has been kicked out — handing them the host role
    // mid-tournament would give them powers they shouldn't have.)
    const { data: player, error: playerError } = await supabase
      .from('tournament_players')
      .select('id, is_eliminated')
      .eq('tournament_id', tournamentId)
      .eq('id', playerId)
      .maybeSingle()
    if (playerError) return NextResponse.json({ error: 'Failed to look up player' }, { status: 500 })
    if (!player) return NextResponse.json({ error: 'Player not found in this tournament' }, { status: 404 })
    if (player.is_eliminated) {
      return NextResponse.json({ error: 'Cannot transfer host to an eliminated player' }, { status: 400 })
    }
  }

  const { error } = await supabase
    .from('tournaments')
    .update({ pending_host_player_id: playerId })
    .eq('id', tournamentId)
  if (error) return NextResponse.json({ error: 'Failed to update nomination' }, { status: 500 })

  return NextResponse.json({ ok: true, pendingHostPlayerId: playerId }, { status: 200 })
}
