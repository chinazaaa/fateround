import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getFreshAccessToken, isSpotifyIdentityAuthorized } from '@/lib/spotify'

/**
 * Vend a short-lived Spotify access token to the Web Playback SDK, mirroring how
 * /api/audio-token vends LiveKit credentials. The caller presents its secret `identity`
 * (the same UUID / `host-*` id it authed with) — that identity IS the bearer credential,
 * matching the app's anonymous player model. Refresh happens server-side with the client
 * secret; the browser never sees the refresh token.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { identity?: string; hostToken?: string }
    const identity = body.identity?.trim()
    if (!identity) {
      return NextResponse.json({ error: 'identity is required' }, { status: 400 })
    }

    // A `host-<CODE>` identity is guessable, so proof of the host token is
    // required before we hand out that host's live Spotify token.
    if (!(await isSpotifyIdentityAuthorized(identity, body.hostToken))) {
      return NextResponse.json({ error: 'Not authorized for this identity' }, { status: 403 })
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
