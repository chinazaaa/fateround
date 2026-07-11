import type { Game, Player } from '@fateround/shared'
import { anonymousPlayerCanChat } from '@fateround/shared/anonymous-messages'

// Colocated mobile mirror of the web-only constants/helpers in
// src/lib/anonymous-messages.ts that are not exported from @fateround/shared.

export const ANONYMOUS_ROOM_MIN_PLAYERS = 2
export const ANONYMOUS_ROOM_MAX_PLAYERS = 20
export const ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS = 20

export const ANONYMOUS_ROOM_DEFAULT_BAN_MINUTES = 10
export const ANONYMOUS_ROOM_BAN_MINUTE_OPTIONS = [5, 10, 15, 30] as const

export function clampAnonymousRoomMaxPlayers(value: number): number {
  return Math.min(ANONYMOUS_ROOM_MAX_PLAYERS, Math.max(ANONYMOUS_ROOM_MIN_PLAYERS, value))
}

export function anonymousRoomMaxPlayers(game: Pick<Game, 'max_players'>): number {
  if (game.max_players == null) return ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS
  return clampAnonymousRoomMaxPlayers(game.max_players)
}

export function countAnonymousRoomPresence(
  players: Pick<Player, 'joined_at' | 'spectator'>[],
  game: Pick<Game, 'status' | 'session_started_at'>
): { total: number; participants: number; viewers: number } {
  if (game.status !== 'active') {
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
