import type { GameType } from './types'
import { parseGameType } from './game-type-checks'

/**
 * Game types that are strictly 1v1 (or don't benefit from >2 humans). The
 * create-screen "party game — make it Public" nudge and the lobby "missing
 * players" prompt both skip these — a chess player looking for one opponent
 * doesn't need a nudge to advertise for 5 more.
 */
const HEAD_TO_HEAD_TYPES: ReadonlySet<GameType> = new Set<GameType>([
  'chess',
  'checkers',
  'checkers_international',
  'checkers_nigeria',
  'tic_tac_toe',
  'ayo',
])

export function isHeadToHeadGame(gameType: GameType | string | undefined): boolean {
  return HEAD_TO_HEAD_TYPES.has(parseGameType(gameType))
}

/**
 * Does the create-screen public-toggle nudge apply to this game right now?
 *
 * The hint reads "Party game? Turn this on so others can find and join." — it
 * only fires when (a) the game supports 3+ humans (`max_players >= 3`), and
 * (b) the type isn't in the 1v1 short-list above. Games with `max_players = 1`
 * (solo mode) get a different hint (see `showsMaxOnePublicHint`).
 */
export function showsPartyPublicHint(
  gameType: GameType | string | undefined,
  maxPlayers: number | null | undefined
): boolean {
  if (isHeadToHeadGame(gameType)) return false
  if (maxPlayers == null) return false
  return maxPlayers >= 3
}

/**
 * Does the max-players guard hint apply? Rendered directly below the Public
 * toggle when the host has bumped max_players down to 1 — a Public solo game
 * is a contradiction (no seat to fill). Copy: "Bump the max players above 1
 * so other people can join."
 */
export function showsMaxOnePublicHint(maxPlayers: number | null | undefined): boolean {
  return maxPlayers === 1
}
