import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import {
  buildAuthorizeUrl,
  codeChallengeFor,
  generateCodeVerifier,
  randomState,
  signHandshake,
  SPOTIFY_OAUTH_COOKIE,
  SPOTIFY_OAUTH_MAX_AGE_SECONDS,
} from '@/lib/spotify'
import { authorizedMusicIdentity, musicAuthFromParams } from '@/lib/music-auth'

/**
 * Kick off Spotify OAuth (Authorization Code + PKCE).
 *
 * Body: `gameCode` + `role` (host|player) + `token` (the game's host token, or the player's
 * resume token) and `returnTo` (the in-app path to come back to after auth). The identity the
 * connection is filed under is derived server-side from that proof — it used to be passed in
 * directly, which let anyone bind a Spotify account to someone else's slot (audit finding C3).
 * We generate a PKCE verifier + state, stash them in a short-lived signed httpOnly cookie, and
 * return the authorize URL for the caller to navigate to.
 *
 * POST returning a URL rather than a GET redirect from an `<a href>`: the proof is a secret, and
 * a query string puts it in access logs, CDN logs and browser history. Same reasoning as
 * /api/codewords/board (both flagged in review on PR #736).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, string | undefined>
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(body)) if (typeof v === 'string') params.set(k, v)

    const identity = await authorizedMusicIdentity(musicAuthFromParams(params))
    if (!identity) {
      return NextResponse.json({ error: 'Not authorized to connect Spotify for this game' }, { status: 403 })
    }
    // Only allow returning to an internal path, never an absolute URL (open-redirect guard).
    // Reject `\` too: `new URL('/\\evil.com', origin)` resolves to an external host because
    // browsers/WHATWG treat backslashes as slashes, so `/\evil.com` → `//evil.com`.
    const rawReturn = params.get('returnTo') ?? '/'
    const returnTo =
      rawReturn.startsWith('/') && !rawReturn.startsWith('//') && !rawReturn.includes('\\') ? rawReturn : '/'

    const verifier = generateCodeVerifier()
    const challenge = await codeChallengeFor(verifier)
    const state = randomState()

    const cookie = await signHandshake({ verifier, state, identity, returnTo })
    const res = NextResponse.json({ authorizeUrl: buildAuthorizeUrl(state, challenge) })
    res.cookies.set(SPOTIFY_OAUTH_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SPOTIFY_OAUTH_MAX_AGE_SECONDS,
    })
    return res
  } catch (err) {
    const message = internalErrorMessage('spotify/login', err, 'Could not start Spotify login')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
