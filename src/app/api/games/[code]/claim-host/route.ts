import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'
import { generateToken } from '@/lib/utils'

/**
 * A nominated player claims host. Authorized by the claimant's OWN resume_token (the same
 * secret that authorizes their player actions), so the new host_token is only ever returned
 * to someone who has proven they are the nominee — the token never travels to a bystander.
 *
 * Mints a fresh host_token, atomically swapping it in only if this player is still the
 * pending nominee (a conditional UPDATE guards against a stale/duplicate claim). The old
 * host's token stops matching immediately, so their host UI drops on its next auth check.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  let body: { resumeToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const resumeToken = typeof body?.resumeToken === 'string' ? body.resumeToken : ''

  const supabase = getSupabaseAdmin()
  const auth = await assertPlayer(supabase, code, resumeToken)
  if (auth.error || !auth.player) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gameId = auth.id
  const playerId = auth.player.id

  const newHostToken = generateToken()

  // Atomic swap: only succeeds while this player is still the pending nominee. If a second
  // claim races in, or the host cancelled the nomination, no row matches and we 409.
  const { data: updated, error: updateError } = await supabase
    .from('games')
    .update({ host_token: newHostToken, pending_host_player_id: null })
    .eq('id', gameId)
    .eq('pending_host_player_id', playerId)
    .select('id')
    .maybeSingle()

  // A real DB error must not be reported as a stale claim — reserve the 409 for the no-row case.
  if (updateError) {
    return NextResponse.json({ error: 'Failed to claim host transfer' }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({ error: 'No pending host transfer for you' }, { status: 409 })
  }

  return NextResponse.json({ ok: true, hostToken: newHostToken }, { status: 200 })
}
