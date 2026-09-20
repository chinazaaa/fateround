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
    // `?? {}` because `req.json()` PARSES a literal `null` body successfully, so the
    // `.catch` never fires and every `body.x` read below would throw on null.
    const body = ((await req.json().catch(() => ({}))) ?? {}) as { gameCode?: string; hostToken?: string; q?: string }
    // `gameCode`, `hostToken` and `q` come off an unchecked `as {...}` cast, so each can be
    // any JSON value. A non-string cleared `?.` (which short-circuits on nullish, not falsy)
    // and threw on .trim(); the catch below turned that into a 500. Reading each one as a
    // string-or-nothing sends it to the gate it already has for '' and null.
    const gameCode = typeof body.gameCode === 'string' ? body.gameCode.trim().toUpperCase() : undefined
    const hostToken = typeof body.hostToken === 'string' ? body.hostToken.trim() : undefined
    const q = typeof body.q === 'string' ? body.q.trim() : undefined
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
