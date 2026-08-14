import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

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

  const { data: tokenRow } = await supabase
    .from('tournament_player_tokens')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .ilike('token', resumeToken)
    .maybeSingle()
  if (!tokenRow) return NextResponse.json({ error: 'Player code not found' }, { status: 404 })
  const playerId = tokenRow.player_id as string

  // Conditional clear: only null the pending nominee if it's still US.
  // Prevents a slow decline race from cancelling a fresh, unrelated nomination.
  await supabase
    .from('tournaments')
    .update({ pending_host_player_id: null })
    .eq('id', tournamentId)
    .eq('pending_host_player_id', playerId)

  return NextResponse.json({ ok: true }, { status: 200 })
}
