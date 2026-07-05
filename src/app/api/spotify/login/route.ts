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
    // Only allow returning to an internal path, never an absolute URL (open-redirect guard).
    const rawReturn = req.nextUrl.searchParams.get('returnTo') ?? '/'
    const returnTo = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/'

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
