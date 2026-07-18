import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Records which player row is the game's host, so every client can badge the host
 * in the roster drawer (`games.host_player_id`). Non-secret — just a player id, like
 * `pending_host_player_id`. Authorised by the secret host token.
 *
 * Called by `useHostSeat` whenever the host's own player id is known (host+play, or
 * the host-only spectator seat). `playerId: null` clears it. Host transfer repoints
 * it in `claim-host`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()

  let body: { hostToken?: unknown; playerId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  const playerId = typeof body?.playerId === 'string' ? body.playerId : body?.playerId === null ? null : undefined
  if (!hostToken || playerId === undefined) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: game } = await supabase.from('games').select('host_token').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { error } = await supabase.from('games').update({ host_player_id: playerId }).eq('id', gameId)
  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  return NextResponse.json({ ok: true }, { status: 200 })
}
