import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { exchangeCode, fetchProfile, upsertAccount, verifyHandshake, SPOTIFY_OAUTH_COOKIE } from '@/lib/spotify'

/**
 * Spotify OAuth redirect target. Verifies the signed handshake cookie + state, exchanges
 * the code for tokens (server-side, with the client secret), stores them keyed by the
 * caller's identity, then bounces the user back into the game via `returnTo`.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const backTo = (path: string, params?: Record<string, string>) => {
    const url = new URL(path.startsWith('/') ? path : '/', origin)
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = NextResponse.redirect(url)
    res.cookies.delete(SPOTIFY_OAUTH_COOKIE)
    return res
  }

  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    const oauthError = req.nextUrl.searchParams.get('error')

    const handshake = await verifyHandshake(req.cookies.get(SPOTIFY_OAUTH_COOKIE)?.value)
    if (!handshake) return backTo('/', { spotify: 'error' })

    // User denied, or state mismatch (CSRF) — bounce back without connecting.
    if (oauthError || !code || !state || state !== handshake.state) {
      return backTo(handshake.returnTo, { spotify: oauthError === 'access_denied' ? 'denied' : 'error' })
    }

    const tokens = await exchangeCode(code, handshake.verifier)
    const profile = await fetchProfile(tokens.access_token)
    await upsertAccount({ identity: handshake.identity, tokens, profile })

    return backTo(handshake.returnTo, { spotify: 'connected' })
  } catch (err) {
    internalErrorMessage('spotify/callback', err)
    return backTo('/', { spotify: 'error' })
  }
}
