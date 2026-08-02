import type { CatalogTrophy } from '../catalog'

/**
 * One code-authored trophy for one game.
 *
 * `counter` must be a key the game's facts builder actually emits AND that is registered in
 * `../counters.ts`. Neither half is optional: an unregistered key cannot be saved as a rule, and
 * an unemitted one reads as zero forever — a trophy nobody can earn, indistinguishable from a
 * typo. `game-facts/vocabulary.test.ts` guards the first; the second is on the author.
 *
 * `gte` defaults to 1, which is what almost every per-game flag wants ("did it in a round").
 * Give it a value only for genuinely cumulative counters, like "answer 500 questions".
 */
export type SystemTrophySpec = {
  suffix: string
  tier: CatalogTrophy['tier']
  title: string
  description: string
  counter: string
  gte?: number
  points: number
  sortOrder: number
  hidden?: boolean
}
