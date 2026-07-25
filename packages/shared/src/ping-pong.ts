// Client-safe pure logic for Ping Pong, mirrored from `src/lib/ping-pong.ts` (web).
// Server-side mutation logic (scoring, session init, forfeits) stays web-only —
// mobile calls the existing web API routes for those (see apps/mobile/lib/game-api.ts
// postPingPongPoint / postPingPongExpire).

export const PING_PONG_MIN_PLAYERS = 2
export const PING_PONG_MAX_PLAYERS = 2
export const PING_PONG_DEFAULT_MAX_PLAYERS = 2

export const PING_PONG_POINTS_OPTIONS = [3, 5, 7, 11, 15, 21] as const
export const PING_PONG_DEFAULT_POINTS = 7

export const PING_PONG_GAME_DURATION_OPTIONS = [0, 60, 120, 180, 300, 600] as const
export const PING_PONG_DEFAULT_GAME_DURATION = 0

export function clampPingPongPoints(value: unknown): number {
  const n = Number(value)
  return (PING_PONG_POINTS_OPTIONS as readonly number[]).includes(n) ? n : PING_PONG_DEFAULT_POINTS
}

export function formatPingPongDuration(seconds: number): string {
  if (seconds === 0) return 'No timer'
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`
}

/** Deuce-aware serve alternation: serve swaps every 2 points, or every point once both
 * players are at (pointsToWin - 1) or more (deuce). */
export function pingPongServingSide(scoreX: number, scoreO: number, pointsToWin: number): 'X' | 'O' {
  const total = scoreX + scoreO
  const deuce = scoreX >= pointsToWin - 1 && scoreO >= pointsToWin - 1
  return deuce ? (total % 2 === 0 ? 'X' : 'O') : total % 4 < 2 ? 'X' : 'O'
}

export function isPingPongResultsPhase(
  gameStatus: string | undefined,
  session: { status: 'active' | 'finished'; winner_player_id: string | null } | null | undefined
): boolean {
  if (!gameStatus || gameStatus === 'waiting') return false
  if (gameStatus === 'finished') return true
  if (!session) return false
  return session.status === 'finished' || !!session.winner_player_id
}

export function pingPongGameSessionExpired(sessionStartedAt: string | null, durationSeconds: number): boolean {
  if (!sessionStartedAt || durationSeconds <= 0) return false
  const elapsedSeconds = (Date.now() - new Date(sessionStartedAt).getTime()) / 1000
  return elapsedSeconds > durationSeconds + 1
}
