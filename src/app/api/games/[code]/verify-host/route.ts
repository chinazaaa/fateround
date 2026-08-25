import { NextRequest, NextResponse } from 'next/server'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Validates a host token for a game. The client can no longer read `games.host_token`
 * (migration 0122), so the host page calls this to gate the host UI. Server actions
 * still independently enforce host auth — this is just the early "are you the host?" check.
 *
 * Also opportunistically backfills `games.host_user_id` when a signed-in host verifies
 * their token and the column is still NULL — the game was created as a guest, before the
 * identity column existed, or while Supabase Auth was Unhealthy and the create-time
 * profile lookup failed. Without this, the cross-device "Continue" strip on the home page
 * can't recognise the caller as the host from a device that doesn't hold the host token
 * (see /api/profile/active-games), and routes them into their own game as a plain player.
 * The host-token match here is the strong proof — no other caller could have supplied it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const gameId = code.toUpperCase()

  let body: { hostToken?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid input' }, { status: 400 })
  }
  const hostToken = typeof body?.hostToken === 'string' ? body.hostToken : ''
  if (!hostToken) return NextResponse.json({ ok: false }, { status: 200 })

  const supabase = getSupabaseAdmin()
  const { data: game } = await supabase.from('games').select('host_token, host_user_id').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ ok: false, notFound: true }, { status: 200 })

  const ok = game.host_token === hostToken

  if (ok && !game.host_user_id) {
    // Only run the auth call when a backfill is actually possible — every other
    // verify-host path stays a single-select.
    const profileId = await getProfileFromRequest(req)
    if (profileId) {
      // Fail-open: a backfill error must never break the host page load.
      await supabase.from('games').update({ host_user_id: profileId }).eq('id', gameId).is('host_user_id', null)
    }
  }

  return NextResponse.json({ ok }, { status: 200 })
}
