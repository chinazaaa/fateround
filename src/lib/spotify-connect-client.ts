import type { MusicAuth } from '@/lib/music-auth'

/**
 * Start the Spotify OAuth handshake and navigate to Spotify's consent page.
 *
 * POSTs the caller's proof (host token / resume token) rather than putting it in an `<a href>`
 * query string, which would leave the secret in access logs, CDN logs and browser history —
 * the same issue fixed on /api/codewords/board (flagged in review on PR #736). The route sets
 * the signed PKCE handshake cookie and hands back the URL to send the browser to.
 *
 * @returns an error message to show the user, or null once navigation has begun.
 */
export async function startSpotifyConnect(auth: MusicAuth, returnTo: string): Promise<string | null> {
  const payload =
    auth.kind === 'host'
      ? { role: 'host', gameCode: auth.gameCode, token: auth.hostToken, returnTo }
      : { role: 'player', gameCode: auth.gameCode, token: auth.resumeToken, returnTo }

  try {
    const res = await fetch('/api/spotify/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as { authorizeUrl?: string; error?: string }
    if (!res.ok || !data.authorizeUrl) return data.error ?? 'Could not start Spotify login'
    window.location.href = data.authorizeUrl
    return null
  } catch {
    return 'Could not reach Spotify. Please try again.'
  }
}
