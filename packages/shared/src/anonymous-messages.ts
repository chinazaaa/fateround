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

export function anonymousPlayerCanChat(
  player: Pick<Player, 'joined_at' | 'spectator'>,
  game: Pick<Game, 'status' | 'session_started_at'>
): boolean {
  if (game.status === 'waiting') return true
  if (player.spectator) return false
  if (!game.session_started_at) return false
  return new Date(player.joined_at).getTime() < new Date(game.session_started_at).getTime()
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
