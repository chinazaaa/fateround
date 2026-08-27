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
  const isBot = (auth.player as { is_bot?: boolean }).is_bot === true
  const isSpectator = (auth.player as { spectator?: boolean }).spectator === true
  const newHostUserId = (auth.player as { user_id?: string | null }).user_id ?? null

  const newHostToken = generateToken()

  // Try the named-nominee swap first. Succeeds while this player is still the pending
  // nominee — atomic on the row, so a second racing claim of the same shape gets 409.
  const { data: namedUpdate, error: namedError } = await supabase
    .from('games')
    .update({
      host_token: newHostToken,
      pending_host_player_id: null,
      pending_host_nominated_at: null,
      host_player_id: playerId,
      host_user_id: newHostUserId,
    })
    .eq('id', gameId)
    .eq('pending_host_player_id', playerId)
    .select('id')
    .maybeSingle()

  if (namedError) {
    return NextResponse.json({ error: 'Failed to claim host transfer' }, { status: 500 })
  }
  if (namedUpdate) {
    return NextResponse.json({ ok: true, hostToken: newHostToken }, { status: 200 })
  }

  // Not the named nominee. Fall through to the open-claim path: any remaining
  // non-bot, non-spectator player may claim if the nomination has been stale
  // for OPEN_CLAIM_AFTER_SECONDS. Prevents a nominee ignoring the banner from
  // stalling the game for the idle-reaper window.
  const OPEN_CLAIM_AFTER_SECONDS = 60
  if (isBot || isSpectator) {
    return NextResponse.json({ error: 'No pending host transfer for you' }, { status: 409 })
  }
  const cutoff = new Date(Date.now() - OPEN_CLAIM_AFTER_SECONDS * 1000).toISOString()
  const { data: openUpdate, error: openError } = await supabase
    .from('games')
    .update({
      host_token: newHostToken,
      pending_host_player_id: null,
      pending_host_nominated_at: null,
      host_player_id: playerId,
      host_user_id: newHostUserId,
    })
    .eq('id', gameId)
    .not('pending_host_player_id', 'is', null)
    .lt('pending_host_nominated_at', cutoff)
    .select('id')
    .maybeSingle()
  if (openError) {
    return NextResponse.json({ error: 'Failed to claim host transfer' }, { status: 500 })
  }
  if (!openUpdate) {
    return NextResponse.json({ error: 'No pending host transfer for you' }, { status: 409 })
  }
  return NextResponse.json({ ok: true, hostToken: newHostToken }, { status: 200 })
}
