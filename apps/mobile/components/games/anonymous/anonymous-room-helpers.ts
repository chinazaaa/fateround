import { anonymousPlayerCanChat, ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS } from '@fateround/shared/anonymous-messages'
import type { Game, Player } from '@fateround/shared'

const ROOM_MIN_PLAYERS = 2
const ROOM_MAX_PLAYERS = 20

/** Mirrors web anonymousRoomMaxPlayers: default 20, clamped to 2..20. */
export function anonymousRoomMaxPlayers(game: Pick<Game, 'max_players'>): number {
  if (game.max_players == null) return ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS
  return Math.min(ROOM_MAX_PLAYERS, Math.max(ROOM_MIN_PLAYERS, game.max_players))
}

/**
 * Mirrors web countAnonymousRoomPresence: before the session is active
 * everyone counts as a participant; once active, split by who can chat.
 */
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
