/**
 * Leaf helpers for Ludo piece state.
 *
 * Extracted from `@/lib/ludo` to break a runtime import cycle.
 * `src/lib/trophies/game-facts/ludo.ts` needed exactly one function from `@/lib/ludo`, and
 * importing the whole module dragged in `@/lib/game-finish` -> `@/lib/trophies/round-facts`
 * -> the game-facts barrel -> back to `game-facts/ludo`. The barrel builds its `BUILDERS`
 * table at module scope, which is the shape that bites if a binding in the loop is ever
 * `const`: it would be read mid-initialisation. Today's bindings are `export async function`
 * declarations, which are hoisted and so immune — the cycle was a latent hazard, not a
 * demonstrated failure, and the extraction removes it before someone changes one.
 *
 * Keep this module a LEAF — types only, no value imports from game-logic modules. Anything
 * the trophies layer needs from a game module belongs here rather than behind the cycle.
 */
import type { LudoPiece } from '@/types'

export function finishedPieceCount(pieces: LudoPiece[]): number {
  return pieces.filter((p) => p.zone === 'finished').length
}
