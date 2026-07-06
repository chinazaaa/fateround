import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { appOrigin } from '@/lib/site'
import { exchangeCode, fetchProfile, upsertAccount, verifyHandshake, SPOTIFY_OAUTH_COOKIE } from '@/lib/spotify'

/**
 * Spotify OAuth redirect target. Verifies the signed handshake cookie + state, exchanges
 * the code for tokens (server-side, with the client secret), stores them keyed by the
 * caller's identity, then bounces the user back into the game via `returnTo`.
 */
export async function GET(req: NextRequest) {
  // Build the bounce-back URL from the configured public origin (NEXT_PUBLIC_APP_URL),
  // not req.nextUrl.origin. Behind the reverse proxy the request origin resolves to the
  // raw socket host (0.0.0.0:3000), which would send the browser to the wrong place. This
  // mirrors how the authorize + token-exchange redirect_uri are derived (see lib/spotify).
  const origin = appOrigin()
  const backTo = (path: string, params?: Record<string, string>) => {
    const url = new URL(path.startsWith('/') ? path : '/', origin)
    if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = NextResponse.redirect(url)
    res.cookies.delete(SPOTIFY_OAUTH_COOKIE)
    return res
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const oauthError = req.nextUrl.searchParams.get('error')

  const handshake = await verifyHandshake(req.cookies.get(SPOTIFY_OAUTH_COOKIE)?.value)
  // No handshake cookie survived the redirect — we don't know where to return, so home.
  // `reason=no-handshake` disambiguates this from a downstream failure (see below).
  if (!handshake) return backTo('/', { spotify: 'error', reason: 'no-handshake' })

  // User denied, or state mismatch (CSRF) — bounce back without connecting.
  if (oauthError || !code || !state || state !== handshake.state) {
    const reason = oauthError ?? (!code ? 'no-code' : 'state-mismatch')
    return backTo(handshake.returnTo, { spotify: oauthError === 'access_denied' ? 'denied' : 'error', reason })
  }

  // From here the error could be Spotify (token/profile) or our DB (store). Tag each stage
  // so the failure is diagnosable from the URL, and bounce back to the game — not home.
  let stage: 'token' | 'profile' | 'store' = 'token'
  try {
    const tokens = await exchangeCode(code, handshake.verifier)
    stage = 'profile'
    const profile = await fetchProfile(tokens.access_token)
    stage = 'store'
    await upsertAccount({ identity: handshake.identity, tokens, profile })

    return backTo(handshake.returnTo, { spotify: 'connected' })
  } catch (err) {
    internalErrorMessage(`spotify/callback:${stage}`, err)
    return backTo(handshake.returnTo, { spotify: 'error', reason: stage })
  }
}
