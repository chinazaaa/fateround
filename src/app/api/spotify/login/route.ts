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
  isSpotifyIdentityAuthorized,
} from '@/lib/spotify'

/**
 * Kick off Spotify OAuth (Authorization Code + PKCE).
 *
 * Query: `identity` (the caller's secret player UUID / `host-*` id) and `returnTo`
 * (the in-app path to come back to after auth). We generate a PKCE verifier + state,
 * stash them in a short-lived signed httpOnly cookie, and redirect to Spotify.
 */
export async function GET(req: NextRequest) {
  try {
    const identity = req.nextUrl.searchParams.get('identity')?.trim()
    if (!identity) {
      return NextResponse.json({ error: 'identity is required' }, { status: 400 })
    }
    // Binding a deterministic `host-<CODE>` identity to a Spotify account requires
    // proof of the host token (passed as a query param since this is a redirect
    // link). The token is only checked here — it never travels into Spotify's
    // redirect chain (only verifier/state/identity/returnTo go in the signed cookie).
    const hostToken = req.nextUrl.searchParams.get('hostToken')?.trim()
    if (!(await isSpotifyIdentityAuthorized(identity, hostToken))) {
      return NextResponse.json({ error: 'Not authorized for this identity' }, { status: 403 })
    }
    // Only allow returning to an internal path, never an absolute URL (open-redirect guard).
    // Reject `\` too: `new URL('/\\evil.com', origin)` resolves to an external host because
    // browsers/WHATWG treat backslashes as slashes, so `/\evil.com` → `//evil.com`.
    const rawReturn = req.nextUrl.searchParams.get('returnTo') ?? '/'
    const returnTo =
      rawReturn.startsWith('/') && !rawReturn.startsWith('//') && !rawReturn.includes('\\') ? rawReturn : '/'

    const verifier = generateCodeVerifier()
    const challenge = await codeChallengeFor(verifier)
    const state = randomState()

    const cookie = await signHandshake({ verifier, state, identity, returnTo })
    const res = NextResponse.redirect(buildAuthorizeUrl(state, challenge))
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
