import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getFreshAccessToken } from '@/lib/spotify'
import { authorizedMusicIdentity, type MusicAuth } from '@/lib/music-auth'

/**
 * Vend a short-lived Spotify access token to the Web Playback SDK, mirroring how
 * /api/audio-token vends LiveKit credentials.
 *
 * The caller proves ownership with the game's host token or their own resume token; the
 * `spotify_accounts` identity is derived from whichever row that resolves to, never taken
 * from the request. It previously accepted a bare `identity`, which is public — see the note
 * in `src/lib/music-auth.ts`. Refresh happens server-side with the client secret; the browser
 * never sees the refresh token.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { auth?: MusicAuth }

    const identity = await authorizedMusicIdentity(body.auth)
    if (!identity) {
      return NextResponse.json({ error: 'Not authorized for this Spotify connection' }, { status: 403 })
    }

    const fresh = await getFreshAccessToken(identity)
    if (!fresh) {
      return NextResponse.json({ error: 'not_connected' }, { status: 404 })
    }

    return NextResponse.json({
      accessToken: fresh.accessToken,
      expiresAt: fresh.expiresAt,
      product: fresh.product,
    })
  } catch (err) {
    const message = internalErrorMessage('spotify/token', err, 'Could not get a Spotify token')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
