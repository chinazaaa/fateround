import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertTournamentHostUnfinished } from '@/lib/tournament-admin'

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

  const supabase = getSupabaseAdmin()
  const auth = await assertTournamentHostUnfinished(
    supabase,
    code,
    hostToken,
    "Can't transfer host of a finished tournament",
    { missingTokenError: 'Missing hostToken' }
  )
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
