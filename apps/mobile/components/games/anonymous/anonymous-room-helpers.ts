import { countAnonymousRoomPresence, ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS } from '@fateround/shared/anonymous-messages'
import type { Game, Player } from '@fateround/shared'

const ROOM_MIN_PLAYERS = 2
const ROOM_MAX_PLAYERS = 20

/** Mirrors web anonymousRoomMaxPlayers: default 20, clamped to 2..20. */
export function anonymousRoomMaxPlayers(game: Pick<Game, 'max_players'>): number {
  if (game.max_players == null) return ANONYMOUS_ROOM_DEFAULT_MAX_PLAYERS
  return Math.min(ROOM_MAX_PLAYERS, Math.max(ROOM_MIN_PLAYERS, game.max_players))
}

// Participant/viewer split lives in @fateround/shared (one tested implementation for web + mobile).
export { countAnonymousRoomPresence }
