import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

/**
 * A nominated player declines the host invite. Authorized by the player's OWN resume_token.
 * Clears the nomination (only if this player is still the pending nominee) WITHOUT rotating
 * the host token, so the current host stays host and can see the decline: their pending
 * indicator clears back to idle.
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

  const { data } = await supabase
    .from('games')
    .update({ pending_host_player_id: null })
    .eq('id', auth.id)
    .eq('pending_host_player_id', auth.player.id)
    .select('id')
    .maybeSingle()

  return NextResponse.json({ ok: true, declined: !!data }, { status: 200 })
}
