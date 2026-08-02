/**
 * The trophy criteria DSL and its evaluator (`docs/trophies-and-streaks.md` §3.10).
 *
 * This is what makes the catalog **admin-editable**: a trophy is a rule over counters, stored
 * as jsonb, so "win 25 games" is a row rather than a deploy. What admin *cannot* invent is a
 * new measurement — if nothing emits a counter, no rule can reference it. The vocabulary in
 * `./counters` is therefore the real product surface; see that file.
 *
 * TWO PROPERTIES THIS FILE MUST KEEP:
 *
 * 1. **Pure.** It takes a snapshot the server built from its own tables and returns a verdict.
 *    It never sees a request body. The recurring failure in this class of feature is a client
 *    that reports both what it did and what it earned, and a server that writes down both —
 *    so the evaluator is deliberately given no way to be told a total.
 *
 * 2. **Total.** `criteria` is admin-authored jsonb, which means it is untrusted input that
 *    arrives from a text box. Every function here returns a verdict for *any* input and throws
 *    for none. A malformed rule must make one trophy unearnable, never break the award pass for
 *    everyone else in the game.
 */

/** Where a counter is scoped. `__global__` aggregates across every game type. */
export const GLOBAL_SCOPE = '__global__'

/** Nesting bound for `all`/`any`. Admin-authored input needs a ceiling, not good intentions. */
const MAX_DEPTH = 5

/** Fan-out bound per combinator, for the same reason. */
const MAX_BRANCHES = 20

export type Criteria =
  /** A scalar counter reached a threshold. `gameType` omitted means the global scope. */
  | { type: 'counter'; counter: string; gte: number; gameType?: string }
  /** A set reached a size — distinct modes played, distinct opponents faced. */
  | { type: 'distinct'; key: string; gte: number }
  /** Every branch must hold. */
  | { type: 'all'; of: Criteria[] }
  /** Any branch may hold. */
  | { type: 'any'; of: Criteria[] }

/**
 * Everything the evaluator is allowed to know, built server-side from `player_stats` and
 * `player_distinct`.
 */
export type ProgressSnapshot = {
  /** gameType (or GLOBAL_SCOPE) → counter name → value. */
  counters: Record<string, Record<string, number>>
  /** distinct-set key → number of members. */
  distinct: Record<string, number>
}

export type Verdict = {
  met: boolean
  /**
   * How close, 0–1. Drives "3 / 10" in the UI and the progress ring. Always defined, so the
   * UI never has to special-case an unmet trophy it can't describe.
   */
  progress: number
}

const UNMET: Verdict = { met: false, progress: 0 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Narrow untrusted jsonb to a `Criteria`, or null.
 *
 * Returning null rather than throwing is the point: a trophy whose rule doesn't parse is
 * simply never earned, and the rest of the catalog keeps working.
 */
export function parseCriteria(value: unknown, depth = 0): Criteria | null {
  if (depth > MAX_DEPTH || !isRecord(value)) return null

  switch (value.type) {
    case 'counter': {
      if (typeof value.counter !== 'string' || !value.counter) return null
      if (typeof value.gte !== 'number' || !Number.isFinite(value.gte)) return null
      const gameType = typeof value.gameType === 'string' && value.gameType ? value.gameType : undefined
      return { type: 'counter', counter: value.counter, gte: value.gte, ...(gameType ? { gameType } : {}) }
    }
    case 'distinct': {
      if (typeof value.key !== 'string' || !value.key) return null
      if (typeof value.gte !== 'number' || !Number.isFinite(value.gte)) return null
      return { type: 'distinct', key: value.key, gte: value.gte }
    }
    case 'all':
    case 'any': {
      if (!Array.isArray(value.of) || value.of.length === 0 || value.of.length > MAX_BRANCHES) return null
      const branches: Criteria[] = []
      for (const branch of value.of) {
        const parsed = parseCriteria(branch, depth + 1)
        // One bad branch invalidates the whole rule. The alternative — silently dropping it —
        // would quietly make an `all` easier to satisfy than its author intended.
        if (!parsed) return null
        branches.push(parsed)
      }
      return { type: value.type, of: branches }
    }
    default:
      return null
  }
}

/** Clamp to 0–1 and keep NaN out of the UI. A threshold of 0 is already met. */
function ratio(current: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 1
  if (!Number.isFinite(current) || current <= 0) return 0
  return Math.min(1, current / target)
}

function counterValue(snapshot: ProgressSnapshot, counter: string, gameType?: string): number {
  const scope = snapshot.counters[gameType ?? GLOBAL_SCOPE]
  const value = scope?.[counter]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Evaluate a parsed rule against a snapshot.
 *
 * Progress for `all` is the *minimum* branch (you are as far along as your weakest
 * requirement) and for `any` the *maximum* (your best route in). Averaging `all` would show
 * someone at 90% when one branch sits at zero, which reads as nearly-there and isn't.
 */
export function evaluate(criteria: Criteria, snapshot: ProgressSnapshot): Verdict {
  switch (criteria.type) {
    case 'counter': {
      const current = counterValue(snapshot, criteria.counter, criteria.gameType)
      return { met: current >= criteria.gte, progress: ratio(current, criteria.gte) }
    }
    case 'distinct': {
      const raw = snapshot.distinct[criteria.key]
      const current = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
      return { met: current >= criteria.gte, progress: ratio(current, criteria.gte) }
    }
    case 'all': {
      const verdicts = criteria.of.map((branch) => evaluate(branch, snapshot))
      return {
        met: verdicts.every((v) => v.met),
        progress: Math.min(...verdicts.map((v) => v.progress)),
      }
    }
    case 'any': {
      const verdicts = criteria.of.map((branch) => evaluate(branch, snapshot))
      return {
        met: verdicts.some((v) => v.met),
        progress: Math.max(...verdicts.map((v) => v.progress)),
      }
    }
  }
}

/** Parse-then-evaluate. Unparseable rules are unmet, never thrown. */
export function evaluateRaw(criteria: unknown, snapshot: ProgressSnapshot): Verdict {
  const parsed = parseCriteria(criteria)
  return parsed ? evaluate(parsed, snapshot) : UNMET
}
