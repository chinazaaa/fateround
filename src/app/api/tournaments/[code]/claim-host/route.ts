import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { generateToken } from '@/lib/utils'
import { resolveTournamentPlayerId } from '@/lib/tournament-token-lookup'

/**
 * A nominated tournament player claims the host role. Authorised by the
 * claimant's own tournament resume token, so the new host_token is only ever
 * returned to someone who has proven they are the nominee — the token never
 * travels to a bystander.
 *
 * Mints a fresh host_token and atomically swaps it in only if this player is
 * still the pending nominee (a conditional UPDATE guards against a stale /
 * duplicate claim). The old host's token stops matching immediately, so their
 * host UI drops on its next auth check.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  let body: { resumeToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const resumeToken = typeof body?.resumeToken === 'string' ? body.resumeToken.trim() : ''
  if (!resumeToken) return NextResponse.json({ error: 'Missing resume token' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  // Resolve the resume token → tournament_players.id. Case-insensitive (legacy
  // lowercase-UUID codes alongside the newer short codes) but never a pattern
  // match — see resolveTournamentPlayerId for why ILIKE is unsafe here.
  const { playerId, error: tokenError } = await resolveTournamentPlayerId(supabase, tournamentId, resumeToken)
  if (tokenError) return NextResponse.json({ error: 'Failed to look up player code' }, { status: 500 })
  if (!playerId) return NextResponse.json({ error: 'Player code not found' }, { status: 404 })

  const newHostToken = generateToken()

  // Atomic swap: rotates host_token + null-outs pending only while THIS player
  // is still the pending nominee. If a second claim races in, or the host
  // cancelled the nomination, no row matches and we return 409.
  const { data: updated, error: updateError } = await supabase
    .from('tournaments')
    .update({ host_token: newHostToken, pending_host_player_id: null })
    .eq('id', tournamentId)
    .eq('pending_host_player_id', playerId)
    .select('id')
    .maybeSingle()

  if (updateError) return NextResponse.json({ error: 'Failed to claim host transfer' }, { status: 500 })
  if (!updated) return NextResponse.json({ error: 'No pending host transfer for you' }, { status: 409 })

  return NextResponse.json({ ok: true, hostToken: newHostToken }, { status: 200 })
}
