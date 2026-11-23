import type { Game, Player } from './types'

export const ANONYMOUS_ROOM_SESSION_SECONDS = 15 * 60
export const ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS = 20

export function isPlayerBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false
  return new Date(bannedUntil).getTime() > Date.now()
}

export function banSecondsLeft(bannedUntil: string | null | undefined): number {
  if (!bannedUntil) return 0
  return Math.max(0, Math.ceil((new Date(bannedUntil).getTime() - Date.now()) / 1000))
}

export function formatBanCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Players who join after the session starts, or explicitly as watch-only viewers, may not post. */
export function anonymousPlayerCanChat(
  player: Pick<Player, 'joined_at' | 'spectator'>,
  game: Pick<Game, 'status' | 'session_started_at'>
): boolean {
  // An explicit watch-only join is a spectator even in the lobby, so check it first.
  if (player.spectator) return false
  if (game.status === 'waiting') return true
  if (!game.session_started_at) return false
  return new Date(player.joined_at).getTime() < new Date(game.session_started_at).getTime()
}

/**
 * Participant/viewer split. Waiting and active rooms split by who can chat; any other state
 * counts everyone as a participant. Single implementation shared by web and mobile.
 */
export function countAnonymousRoomPresence(
  players: Pick<Player, 'joined_at' | 'spectator'>[],
  game: Pick<Game, 'status' | 'session_started_at'>
): { total: number; participants: number; viewers: number } {
  if (game.status !== 'active' && game.status !== 'waiting') {
    return { total: players.length, participants: players.length, viewers: 0 }
  }
  let participants = 0
  let viewers = 0
  for (const player of players) {
    if (anonymousPlayerCanChat(player, game)) participants++
    else viewers++
  }
  return { total: players.length, participants, viewers }
}

export function anonymousPlayerCanPost(
  player: Pick<Player, 'joined_at' | 'spectator'>,
  game: Pick<Game, 'status' | 'session_started_at'>,
  bannedUntil?: string | null
): boolean {
  if (isPlayerBanned(bannedUntil)) return false
  return anonymousPlayerCanChat(player, game)
}

export function anonymousSessionExpired(sessionStartedAt: string | null | undefined): boolean {
  if (!sessionStartedAt) return false
  const deadline = new Date(sessionStartedAt).getTime() + ANONYMOUS_ROOM_SESSION_SECONDS * 1000
  return Date.now() >= deadline
}

export function anonymousSessionSecondsLeft(sessionStartedAt: string | null | undefined): number {
  if (!sessionStartedAt) return ANONYMOUS_ROOM_SESSION_SECONDS
  const deadline = new Date(sessionStartedAt).getTime() + ANONYMOUS_ROOM_SESSION_SECONDS * 1000
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function formatSessionCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
