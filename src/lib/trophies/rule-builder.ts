/**
 * Turn trophy rules into something a person can edit, and back again.
 *
 * The rule is stored as jsonb because the evaluator needs structure. But asking an admin to
 * hand-write `{"type":"counter","counter":"games_won","gte":1}` isn't "admin-editable" — it is
 * a JSON console with a save button, and one typo produces a trophy that silently can never be
 * earned. This module is the translation layer: conditions in, rule out, and a plain-English
 * sentence so the person writing it can see what they actually said.
 *
 * Deliberately NOT expressive enough for everything. It covers one or more thresholds joined by
 * all/any, which is the shape of essentially every real trophy. Anything more exotic falls back
 * to raw JSON rather than growing a form that models the entire DSL — `fromCriteria` returns
 * null in that case, which is the editor's signal to stay out of the way.
 */
import { COUNTERS, DISTINCT_SETS } from './counters'

export type Condition = {
  /** Which measure. Matched against the counter or distinct-set key. */
  measure: string
  kind: 'counter' | 'distinct'
  /** The threshold. "at least N". */
  gte: number
}

export type SimpleRule = {
  combinator: 'all' | 'any'
  conditions: Condition[]
}

/** Build the stored rule from what the editor collected. */
export function toCriteria(rule: SimpleRule): unknown {
  const nodes = rule.conditions.map((c) =>
    c.kind === 'distinct'
      ? { type: 'distinct', key: c.measure, gte: c.gte }
      : { type: 'counter', counter: c.measure, gte: c.gte }
  )
  // A single condition needs no wrapper — keeps stored rules readable and diffs small.
  return nodes.length === 1 ? nodes[0] : { type: rule.combinator, of: nodes }
}

/**
 * Read a stored rule back into editable conditions, or null when the builder can't represent
 * it faithfully.
 *
 * Null matters: silently showing a simplified version of a rule the builder doesn't understand
 * would let someone save it back and quietly lose whatever it actually said.
 */
export function fromCriteria(criteria: unknown): SimpleRule | null {
  if (!criteria || typeof criteria !== 'object') return null
  const node = criteria as Record<string, unknown>

  const asCondition = (value: unknown): Condition | null => {
    if (!value || typeof value !== 'object') return null
    const leaf = value as Record<string, unknown>
    if (typeof leaf.gte !== 'number') return null
    // A game-scoped counter is applied on save from the game picker, so a rule carrying its own
    // gameType is still representable — the picker is the thing that put it there.
    if (leaf.type === 'counter' && typeof leaf.counter === 'string') {
      return { measure: leaf.counter, kind: 'counter', gte: leaf.gte }
    }
    if (leaf.type === 'distinct' && typeof leaf.key === 'string') {
      return { measure: leaf.key, kind: 'distinct', gte: leaf.gte }
    }
    return null
  }

  if (node.type === 'all' || node.type === 'any') {
    if (!Array.isArray(node.of) || !node.of.length) return null
    const conditions = node.of.map(asCondition)
    if (conditions.some((c) => c === null)) return null
    return { combinator: node.type, conditions: conditions as Condition[] }
  }

  const single = asCondition(node)
  return single ? { combinator: 'all', conditions: [single] } : null
}

/** Human label for a measure key, falling back to the key so an unknown one is still visible. */
export function measureLabel(measure: string): string {
  return (
    COUNTERS.find((c) => c.key === measure)?.label ?? DISTINCT_SETS.find((d) => d.key === measure)?.label ?? measure
  )
}

/**
 * A plain-English sentence for a rule.
 *
 * The point is that someone can check what they wrote without knowing the DSL. "Win at least 25
 * games" is verifiable at a glance; `{"gte":25}` is not.
 */
export function describeRule(rule: SimpleRule, gameLabel?: string | null): string {
  const parts = rule.conditions.map((c) => `${measureLabel(c.measure).toLowerCase()} of at least ${c.gte}`)
  const joined = parts.length === 1 ? parts[0] : rule.combinator === 'all' ? parts.join(' and ') : parts.join(' or ')
  const scope = gameLabel ? ` in ${gameLabel}` : ''
  return `Earned when the player reaches ${joined}${scope}.`
}
