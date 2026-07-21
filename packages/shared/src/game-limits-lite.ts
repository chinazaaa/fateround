/** Lightweight seat checks for mobile clients (uses max_players when set). */

import { GAME_LIMIT_CODE_DEFAULTS, isLobbyLimitGameType, type LobbyLimitGameType } from './lobby-limits'

export function seatedParticipantCount(players: ReadonlyArray<{ spectator?: boolean | null }>): number {
  return players.filter((p) => p.spectator !== true).length
}

/** Effective seat cap: the host's `max_players` override, else the code default for the
 *  game type (so seat games like chess resolve to 2 even when `max_players` is null).
 *  Mirrors web `lobbyMaxPlayersFromGameClient`. Returns null for un-capped game types. */
export function resolveLobbyMaxPlayers(
  gameType: string | null | undefined,
  game: { max_players?: number | null }
): number | null {
  if (game.max_players != null) return game.max_players
  if (gameType && isLobbyLimitGameType(gameType))
    return GAME_LIMIT_CODE_DEFAULTS[gameType as LobbyLimitGameType].default
  return null
}

/** True when every seat is taken (seated players >= resolved cap). */
export function lobbySeatsFull(
  gameType: string | null | undefined,
  game: { max_players?: number | null },
  players: ReadonlyArray<{ spectator?: boolean | null }>
): boolean {
  const max = resolveLobbyMaxPlayers(gameType, game)
  return max != null && seatedParticipantCount(players) >= max
}

export function lobbyHasOpenPlayerSeat(
  game: { max_players?: number | null },
  players: ReadonlyArray<{ spectator?: boolean | null }>
): boolean {
  if (game.max_players == null) return true
  return seatedParticipantCount(players) < game.max_players
}
