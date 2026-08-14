import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveTournamentPlayerId } from '@/lib/tournament-token-lookup'

/**
 * A nominated tournament player declines the host role. Authorised by the
 * nominee's own resume token so a random third party can't cancel someone
 * else's nomination. Best-effort: if the pending nominee already changed
 * (host re-nominated someone else, host cancelled, another race) we still
 * return 200 — the client is already dismissing the banner locally.
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

  // Exact (case-folded) match, never a pattern — see resolveTournamentPlayerId.
  const { playerId, error: tokenError } = await resolveTournamentPlayerId(supabase, tournamentId, resumeToken)
  if (tokenError) return NextResponse.json({ error: 'Failed to look up player code' }, { status: 500 })
  if (!playerId) return NextResponse.json({ error: 'Player code not found' }, { status: 404 })

  // Conditional clear: only null the pending nominee if it's still US.
  // Prevents a slow decline race from cancelling a fresh, unrelated nomination.
  await supabase
    .from('tournaments')
    .update({ pending_host_player_id: null })
    .eq('id', tournamentId)
    .eq('pending_host_player_id', playerId)

  return NextResponse.json({ ok: true }, { status: 200 })
}
