import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { normalizeResumeToken } from '@/lib/utils'

/**
 * Proof the caller owns the Spotify connection they're asking about.
 *
 * SECURITY (audit finding C3, Aug 2026): `/api/spotify/login` and `/api/spotify/token` used to
 * accept a bare `identity` string and treat it as the credential — the route comment said
 * "that identity IS the bearer credential, matching the app's anonymous player model". It
 * isn't secret in either shape it takes:
 *
 *   * hosts are stored as `host-<GAMECODE>`, and game codes are anon-readable in bulk;
 *   * players are stored under `players.id`, which anon can read from the roster.
 *
 * So anyone could POST a guessed-or-listed identity and receive a freshly-refreshed Spotify
 * ACCESS TOKEN belonging to a real person — enough to control their playback, and (with the
 * scopes that were requested) to read their account email.
 *
 * The fix mirrors `src/lib/audio-room-auth.ts`: the caller presents the same secret the rest
 * of the app authorizes on, and the storage identity is DERIVED from the row it resolves to.
 */
export type MusicAuth =
  | { kind: 'host'; gameCode: string; hostToken: string }
  | { kind: 'player'; gameCode: string; resumeToken: string }

/**
 * Resolve the caller to the `spotify_accounts.identity` they are allowed to act on,
 * or null when the proof doesn't check out.
 */
export async function authorizedMusicIdentity(auth: MusicAuth | undefined | null): Promise<string | null> {
  if (!auth?.gameCode) return null
  const supabase = getSupabaseAdmin()
  const gameId = String(auth.gameCode).toUpperCase()

  if (auth.kind === 'host') {
    const token = String(auth.hostToken ?? '')
    if (!token) return null
    const { data: game } = await supabase.from('games').select('id, host_token').eq('id', gameId).maybeSingle()
    if (!game?.host_token || game.host_token !== token) return null
    return `host-${game.id}`
  }

  if (auth.kind === 'player') {
    const token = normalizeResumeToken(String(auth.resumeToken ?? ''))
    // Same floor as assertPlayer — a token this short can't be real, and matching on it would
    // turn a lucky guess into someone else's OAuth token.
    if (token.length < 4) return null
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('game_id', gameId)
      .eq('resume_token', token)
      .maybeSingle()
    return player?.id ?? null
  }

  return null
}

/**
 * Parse a {@link MusicAuth} out of URL query params, for the OAuth login redirect
 * (a plain `<a href>`, so it can't POST a body).
 */
export function musicAuthFromParams(params: URLSearchParams): MusicAuth | null {
  const gameCode = params.get('gameCode')?.trim()
  const token = params.get('token')?.trim()
  const role = params.get('role')?.trim()
  if (!gameCode || !token) return null
  if (role === 'host') return { kind: 'host', gameCode, hostToken: token }
  if (role === 'player') return { kind: 'player', gameCode, resumeToken: token }
  return null
}
