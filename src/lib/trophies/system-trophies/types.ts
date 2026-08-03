import type { CatalogTrophy } from '../catalog'
import type { Criteria } from '../criteria'

/**
 * One code-authored trophy for one game.
 *
 * MOST specs are a single counter: give `counter` (a key the game's facts builder emits AND that
 * is registered in `../counters.ts`) and, optionally, `gte`. Neither half is optional in effect —
 * an unregistered key cannot be saved as a rule, and an unemitted one reads as zero forever, a
 * trophy nobody can earn, indistinguishable from a typo. `game-facts/vocabulary.test.ts` guards
 * the first; `system-catalog.test.ts` guards that the rule names live measures; the emission is on
 * the author.
 *
 * `gte` defaults to 1, which is what almost every per-game flag wants ("did it in a round").
 * Give it a value only for genuinely cumulative counters, like "answer 500 questions".
 *
 * A FEW specs need a shape a lone counter can't express — "win under every ruleset", "win as three
 * distinct roles", "win in all three board sizes". Give `criteria` instead of `counter`, built
 * from the constructors below (`allOf`/`anyOf`/`counterCrit`/`distinctCrit`). When `criteria` is
 * present the author owns the whole rule, INCLUDING the `gameType` on every counter node — nothing
 * is auto-scoped (see `buildSystemCatalog`), which is exactly what lets a cross-variant clause name
 * a different game type than the one the trophy is filed under. Provide `counter` OR `criteria`,
 * never both.
 */
export type SystemTrophySpec = {
  suffix: string
  tier: CatalogTrophy['tier']
  title: string
  description: string
  /** The common case: one counter, auto-scoped to the game this spec is filed under. */
  counter?: string
  gte?: number
  /** The escape hatch: a fully-formed rule (distinct / all / any). Mutually exclusive with `counter`. */
  criteria?: Criteria
  points: number
  sortOrder: number
  hidden?: boolean
  /**
   * Can this be unlocked DURING play, rather than at the finished screen?
   *
   * Only true when both hold: the condition is decidable at a single action, AND the action
   * handler already computes it as part of doing its job. "Score a Yahtzee" qualifies — the
   * score handler knows the category and the value. "Win from outside the top three at halfway"
   * never will.
   *
   * Marking this does nothing on its own: a route still has to call `unlockNow`. The flag is
   * what AUTHORISES that call, so a finish-derived trophy can't be made to pop early and show a
   * toast for something the counters might not grant.
   */
  instant?: boolean
}

// ── Criteria constructors for composite specs ────────────────────────────────────────────────
// Thin, typed wrappers so a spec author writes intent, not jsonb. Every counter node MUST carry
// its own `gameType` here (composite rules are never auto-scoped), so pass it explicitly.

/** One counter reached a threshold, scoped to a game type. */
export const counterCrit = (counter: string, gte: number, gameType: string): Criteria => ({
  type: 'counter',
  counter,
  gte,
  gameType,
})

/** A distinct set reached a size. Distinct sets are global (backed by `player_distinct`), no scope. */
export const distinctCrit = (key: string, gte: number): Criteria => ({ type: 'distinct', key, gte })

/** Every branch must hold. */
export const allOf = (...of: Criteria[]): Criteria => ({ type: 'all', of })

/** Any branch may hold. */
export const anyOf = (...of: Criteria[]): Criteria => ({ type: 'any', of })
