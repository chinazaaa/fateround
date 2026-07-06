/**
 * Spotify server-side helpers for the in-game music feature.
 *
 * Auth model: Authorization Code + PKCE. The browser never sees the client secret —
 * the login route mints a PKCE challenge, and the callback route exchanges the code
 * (with `SPOTIFY_CLIENT_SECRET`) for tokens which are stored server-side in
 * `spotify_accounts`, keyed by the caller's secret identity (player UUID / `host-*`).
 * Short-lived access tokens are handed to the Web Playback SDK through /api/spotify/token,
 * mirroring how /api/audio-token vends LiveKit credentials.
 *
 * Track SEARCH uses the Client Credentials flow instead (no user, no scopes) so the host
 * can search without personal auth.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { appOrigin } from '@/lib/site'

export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ')

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

/** Refresh a stored access token this many ms before it actually expires. */
const REFRESH_SKEW_MS = 60_000

export function spotifyClientId(): string {
  const id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID
  if (!id) throw new Error('NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not configured')
  return id
}

export function spotifyClientSecret(): string {
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!secret) throw new Error('SPOTIFY_CLIENT_SECRET is not configured')
  return secret
}

/** Must EXACTLY match a redirect URI registered in the Spotify dashboard. Derived from
 *  the app origin so prod / dev / localhost each resolve to their own registered URI. */
export function spotifyRedirectUri(): string {
  return `${appOrigin().replace(/\/$/, '')}/api/spotify/callback`
}

// ---- PKCE ------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(64)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return toBase64Url(new Uint8Array(digest))
}

export function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

// ---- Signed OAuth handshake cookie -----------------------------------------
// Carries the PKCE verifier + state + identity + return path across the redirect.
// HMAC-signed with the client secret (already a server-only secret) so it can't be forged.

export const SPOTIFY_OAUTH_COOKIE = 'spotify_oauth'
export const SPOTIFY_OAUTH_MAX_AGE_SECONDS = 600

export type OAuthHandshake = {
  verifier: string
  state: string
  identity: string
  returnTo: string
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(spotifyClientSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toBase64Url(new Uint8Array(sig))
}

export async function signHandshake(payload: OAuthHandshake): Promise<string> {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${encoded}.${await hmac(encoded)}`
}

export async function verifyHandshake(token: string | undefined | null): Promise<OAuthHandshake | null> {
  if (!token) return null
  const [encoded, sig] = token.split('.')
  if (!encoded || !sig) return null
  try {
    if ((await hmac(encoded)) !== sig) return null
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as OAuthHandshake
    if (!payload.verifier || !payload.state || !payload.identity) return null
    return payload
  } catch {
    return null
  }
}

// ---- Token exchange / refresh ----------------------------------------------

type SpotifyTokenResponse = {
  access_token: string
  token_type: string
  scope?: string
  expires_in: number
  refresh_token?: string
}

export function buildAuthorizeUrl(state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: spotifyClientId(),
    response_type: 'code',
    redirect_uri: spotifyRedirectUri(),
    scope: SPOTIFY_SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(code: string, verifier: string): Promise<SpotifyTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: spotifyRedirectUri(),
      client_id: spotifyClientId(),
      client_secret: spotifyClientSecret(),
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Spotify code exchange failed: ${res.status}`)
  return (await res.json()) as SpotifyTokenResponse
}

async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: spotifyClientId(),
      client_secret: spotifyClientSecret(),
    }),
  })
  if (!res.ok) throw new Error(`Spotify token refresh failed: ${res.status}`)
  return (await res.json()) as SpotifyTokenResponse
}

// ---- Account storage -------------------------------------------------------

export type SpotifyProfile = {
  id: string
  display_name?: string | null
  product?: string | null
}

export async function fetchProfile(accessToken: string): Promise<SpotifyProfile> {
  const res = await fetch(`${API_BASE}/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Spotify /me failed: ${res.status}`)
  return (await res.json()) as SpotifyProfile
}

/** Persist (or update) a listener's tokens after the OAuth callback. */
export async function upsertAccount(params: {
  identity: string
  tokens: SpotifyTokenResponse
  profile: SpotifyProfile
}): Promise<void> {
  const { identity, tokens, profile } = params
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await getSupabaseAdmin()
    .from('spotify_accounts')
    .upsert(
      {
        identity,
        spotify_user_id: profile.id,
        display_name: profile.display_name ?? null,
        product: profile.product ?? null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        scope: tokens.scope ?? SPOTIFY_SCOPES,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'identity' }
    )
}

export type FreshToken = { accessToken: string; expiresAt: string; product: string | null }

/**
 * Return a valid access token for a stored identity, refreshing (and persisting the new
 * token) when it's within the skew window of expiry. Returns null when the identity has
 * never connected Spotify.
 */
export async function getFreshAccessToken(identity: string): Promise<FreshToken | null> {
  const supabase = getSupabaseAdmin()
  const { data: row } = await supabase
    .from('spotify_accounts')
    .select('access_token,refresh_token,expires_at,product')
    .eq('identity', identity)
    .maybeSingle()
  if (!row) return null

  const expiresMs = new Date(row.expires_at).getTime()
  if (expiresMs - Date.now() > REFRESH_SKEW_MS) {
    return { accessToken: row.access_token, expiresAt: row.expires_at, product: row.product }
  }

  // Expired / near-expiry — refresh, but serialize concurrent refreshes per identity. The
  // SDK's getOAuthToken and playUri can both hit /api/spotify/token at once; two parallel
  // refreshes with the same refresh token race (and Spotify may rotate it, invalidating one).
  // Coalesce them onto a single in-flight promise.
  const existing = inflightRefresh.get(identity)
  if (existing) return existing

  const refreshPromise = (async (): Promise<FreshToken> => {
    // Spotify may or may not return a new refresh token; keep the old one when it doesn't.
    const refreshed = await refreshAccessToken(row.refresh_token)
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase
      .from('spotify_accounts')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? row.refresh_token,
        expires_at: expiresAt,
        scope: refreshed.scope ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('identity', identity)
    return { accessToken: refreshed.access_token, expiresAt, product: row.product }
  })().finally(() => inflightRefresh.delete(identity))

  inflightRefresh.set(identity, refreshPromise)
  return refreshPromise
}

/** In-flight token refreshes, keyed by identity, so concurrent callers share one refresh. */
const inflightRefresh = new Map<string, Promise<FreshToken>>()

// ---- Client Credentials (search) -------------------------------------------

let clientToken: { value: string; expiresAt: number } | null = null

export async function getClientCredentialsToken(): Promise<string> {
  if (clientToken && clientToken.expiresAt - Date.now() > REFRESH_SKEW_MS) return clientToken.value
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: spotifyClientId(),
      client_secret: spotifyClientSecret(),
    }),
  })
  if (!res.ok) throw new Error(`Spotify client-credentials failed: ${res.status}`)
  const json = (await res.json()) as SpotifyTokenResponse
  clientToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 }
  return json.access_token
}

export type SpotifyTrack = {
  uri: string
  name: string
  artist: string
  albumArt: string | null
  durationMs: number
}

// Spotify caps the search `limit` at 10 for apps in development mode (11+ → 400
// "Invalid limit"); 50 only becomes available after an extended-quota grant.
export async function searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
  const token = await getClientCredentialsToken()
  const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) })
  const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify search failed: ${res.status} ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as {
    tracks?: {
      items?: Array<{
        uri: string
        name: string
        duration_ms: number
        artists?: Array<{ name: string }>
        album?: { images?: Array<{ url: string }> }
      }>
    }
  }
  return (json.tracks?.items ?? []).map((t) => ({
    uri: t.uri,
    name: t.name,
    artist: (t.artists ?? []).map((a) => a.name).join(', '),
    albumArt: t.album?.images?.[0]?.url ?? null,
    durationMs: t.duration_ms,
  }))
}
