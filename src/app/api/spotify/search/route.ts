import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { searchTracks } from '@/lib/spotify'

/**
 * Track search for the host's music picker. Uses the Client Credentials flow (server-only,
 * no user auth) — but that token is a single app-wide, quota-limited credential, so the
 * endpoint is gated behind the host token (same check as /api/music/control) to stop
 * anonymous callers from exhausting Spotify's shared search quota. POST (not GET) so the
 * host token never lands in a URL / log.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { gameCode?: string; hostToken?: string; q?: string }
    const gameCode = body.gameCode?.trim().toUpperCase()
    const hostToken = body.hostToken?.trim()
    const q = body.q?.trim()
    if (!gameCode || !hostToken) {
      return NextResponse.json({ error: 'gameCode and hostToken are required' }, { status: 400 })
    }
    if (!q) return NextResponse.json({ tracks: [] })

    const { data: game, error: gameErr } = await getSupabaseAdmin()
      .from('games')
      .select('host_token')
      .eq('id', gameCode)
      .maybeSingle()
    // Distinguish a real DB failure (500) from a genuinely missing game (404) — otherwise a
    // transient error masquerades as "Game not found".
    if (gameErr) return NextResponse.json({ error: internalErrorMessage('spotify/search', gameErr) }, { status: 500 })
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    const tracks = await searchTracks(q)
    return NextResponse.json({ tracks })
  } catch (err) {
    const message = internalErrorMessage('spotify/search', err, 'Spotify search failed')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
