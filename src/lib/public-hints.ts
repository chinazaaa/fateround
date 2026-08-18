import type { GameType } from '@/types'
import { parseGameType } from '@/lib/game-types'

/**
 * Mirror of packages/shared/src/public-hints.ts — the web app doesn't wire up
 * `@fateround/shared` as a runtime dependency, so the two helpers used by the
 * create page + host lobby live here. Keep the sets in sync between the two
 * files if either is edited.
 */

const HEAD_TO_HEAD_TYPES: ReadonlySet<GameType> = new Set<GameType>([
  'chess',
  'checkers',
  'checkers_international',
  'checkers_nigeria',
  'tic_tac_toe',
  'ping_pong',
  'ayo',
])

export function isHeadToHeadGame(gameType: GameType | string | undefined): boolean {
  return HEAD_TO_HEAD_TYPES.has(parseGameType(gameType))
}

export function showsPartyPublicHint(
  gameType: GameType | string | undefined,
  maxPlayers: number | null | undefined
): boolean {
  if (isHeadToHeadGame(gameType)) return false
  if (maxPlayers == null) return false
  return maxPlayers >= 3
}

export function showsMaxOnePublicHint(maxPlayers: number | null | undefined): boolean {
  return maxPlayers === 1
}
