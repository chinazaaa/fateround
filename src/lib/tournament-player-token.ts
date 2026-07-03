const tokenKey = (tournamentId: string) => `tournament_ptoken_${tournamentId}`

/**
 * The player's private tournament identity secret, saved in this browser when they
 * joined the tournament. Sent with every game-room join so the server can prove it's
 * really them (and reclaim their seat after a reload / reconnect) instead of trusting
 * the display name alone. Returns null off the client, without a tournament, or if the
 * player never joined on this device.
 */
export function tournamentPlayerToken(tournamentId: string | null | undefined): string | null {
  if (!tournamentId || typeof window === 'undefined') return null
  return window.localStorage.getItem(tokenKey(tournamentId))
}

/**
 * The tournament token for whatever tournament this game page was opened from — read
 * straight off the URL's `?tournament=` param, so join hooks don't need the router
 * context (keeps them testable). Returns null for non-tournament games.
 */
export function currentTournamentPlayerToken(): string | null {
  if (typeof window === 'undefined') return null
  const tournamentId = new URLSearchParams(window.location.search).get('tournament')
  return tournamentPlayerToken(tournamentId)
}
