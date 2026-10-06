/**
 * Leaf helpers for Ludo piece state.
 *
 * Extracted from `@/lib/ludo` to break a runtime import cycle that crashed production.
 * `src/lib/trophies/game-facts/ludo.ts` needed exactly one function from `@/lib/ludo`, and
 * importing the whole module dragged in `@/lib/game-finish` -> `@/lib/trophies/round-facts`
 * -> the game-facts barrel -> back to `game-facts/ludo`. The barrel builds its `BUILDERS`
 * table at module scope, so entering that loop from the game-logic side read `ludoFacts`
 * while it was still in its temporal dead zone: "Cannot access 'i' before initialization".
 *
 * Keep this module a LEAF — types only, no value imports from game-logic modules. Anything
 * the trophies layer needs from a game module belongs here rather than behind the cycle.
 */
import type { LudoPiece } from '@/types'

export function finishedPieceCount(pieces: LudoPiece[]): number {
  return pieces.filter((p) => p.zone === 'finished').length
}
