import { describe, it, expect } from 'vitest'
import { evaluate, evaluateRaw, parseCriteria, GLOBAL_SCOPE, type ProgressSnapshot } from './criteria'
import { COUNTERS, DISTINCT_SETS, isKnownCounter, liveCounters } from './counters'

const snapshot = (over: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  counters: { [GLOBAL_SCOPE]: { games_played: 12, games_won: 3 }, whot: { games_won: 2 } },
  distinct: { modes_played: 4 },
  ...over,
})

describe('parseCriteria', () => {
  it('accepts the three rule shapes an admin can write', () => {
    expect(parseCriteria({ type: 'counter', counter: 'games_won', gte: 5 })).toEqual({
      type: 'counter',
      counter: 'games_won',
      gte: 5,
    })
    expect(parseCriteria({ type: 'distinct', key: 'modes_played', gte: 3 })).toEqual({
      type: 'distinct',
      key: 'modes_played',
      gte: 3,
    })
    expect(parseCriteria({ type: 'all', of: [{ type: 'counter', counter: 'games_won', gte: 1 }] })).not.toBeNull()
  })

  it.each([
    ['not an object', 'nonsense'],
    ['unknown type', { type: 'sql', q: 'drop table' }],
    ['missing threshold', { type: 'counter', counter: 'games_won' }],
    ['non-numeric threshold', { type: 'counter', counter: 'games_won', gte: '5' }],
    ['empty counter name', { type: 'counter', counter: '', gte: 1 }],
    ['NaN threshold', { type: 'counter', counter: 'games_won', gte: Number.NaN }],
    ['empty combinator', { type: 'all', of: [] }],
    ['combinator over junk', { type: 'any', of: [{ type: 'nope' }] }],
  ])('rejects %s rather than throwing', (_label, input) => {
    // Criteria is admin-authored jsonb — untrusted input from a text box. A bad rule must make
    // one trophy unearnable, never break the award pass for everyone else in the game.
    expect(() => parseCriteria(input)).not.toThrow()
    expect(parseCriteria(input)).toBeNull()
  })

  it('refuses rules nested past the depth bound', () => {
    let deep: unknown = { type: 'counter', counter: 'games_won', gte: 1 }
    for (let i = 0; i < 8; i++) deep = { type: 'all', of: [deep] }
    expect(parseCriteria(deep)).toBeNull()
  })

  it('refuses a combinator with too many branches', () => {
    const of = Array.from({ length: 50 }, () => ({ type: 'counter', counter: 'games_won', gte: 1 }))
    expect(parseCriteria({ type: 'all', of })).toBeNull()
  })

  it('rejects the whole rule when one branch is bad', () => {
    // Dropping the bad branch instead would quietly make an `all` EASIER to satisfy than its
    // author intended — a trophy handed out for less than it says on it.
    const parsed = parseCriteria({
      type: 'all',
      of: [{ type: 'counter', counter: 'games_won', gte: 5 }, { type: 'bogus' }],
    })
    expect(parsed).toBeNull()
  })
})

describe('evaluate', () => {
  it('meets a global counter at the threshold', () => {
    expect(evaluate({ type: 'counter', counter: 'games_played', gte: 12 }, snapshot())).toEqual({
      met: true,
      progress: 1,
    })
  })

  it('scopes a counter to a game type when asked', () => {
    const rule = { type: 'counter', counter: 'games_won', gte: 2, gameType: 'whot' } as const
    expect(evaluate(rule, snapshot()).met).toBe(true)
    // The same threshold against a game type with no history must not borrow the global total.
    expect(evaluate({ ...rule, gameType: 'chess' }, snapshot()).met).toBe(false)
  })

  it('treats an unknown counter as zero rather than erroring', () => {
    // This is why the admin UI has to list the vocabulary: a typo is indistinguishable at
    // runtime from a measure that simply hasn't happened yet.
    expect(evaluate({ type: 'counter', counter: 'gaems_won', gte: 1 }, snapshot())).toEqual({
      met: false,
      progress: 0,
    })
  })

  it('reports partial progress for the UI', () => {
    expect(evaluate({ type: 'counter', counter: 'games_won', gte: 12 }, snapshot()).progress).toBeCloseTo(0.25)
  })

  it('never reports progress above 1', () => {
    expect(evaluate({ type: 'counter', counter: 'games_played', gte: 2 }, snapshot()).progress).toBe(1)
  })

  it('takes the WEAKEST branch as progress for `all`', () => {
    // Averaging would show 90% while one requirement sits at zero, which reads as
    // nearly-there and isn't.
    const verdict = evaluate(
      {
        type: 'all',
        of: [
          { type: 'counter', counter: 'games_played', gte: 12 }, // met, 1
          { type: 'counter', counter: 'perfect_games', gte: 10 }, // absent, 0
        ],
      },
      snapshot()
    )
    expect(verdict).toEqual({ met: false, progress: 0 })
  })

  it('takes the BEST branch as progress for `any`', () => {
    const verdict = evaluate(
      {
        type: 'any',
        of: [
          { type: 'counter', counter: 'perfect_games', gte: 10 },
          { type: 'counter', counter: 'games_played', gte: 12 },
        ],
      },
      snapshot()
    )
    expect(verdict).toEqual({ met: true, progress: 1 })
  })

  it('counts distinct sets', () => {
    expect(evaluate({ type: 'distinct', key: 'modes_played', gte: 4 }, snapshot()).met).toBe(true)
    expect(evaluate({ type: 'distinct', key: 'modes_played', gte: 5 }, snapshot()).met).toBe(false)
  })

  it('treats a zero threshold as already met instead of dividing by zero', () => {
    expect(evaluate({ type: 'counter', counter: 'anything', gte: 0 }, snapshot())).toEqual({
      met: true,
      progress: 1,
    })
  })
})

describe('evaluateRaw', () => {
  it('scores an unparseable rule as unmet', () => {
    expect(evaluateRaw({ type: 'drop-tables' }, snapshot())).toEqual({ met: false, progress: 0 })
  })

  it('evaluates a well-formed rule that arrived as plain jsonb', () => {
    expect(evaluateRaw({ type: 'counter', counter: 'games_played', gte: 10 }, snapshot()).met).toBe(true)
  })
})

describe('the counter vocabulary', () => {
  it('has no duplicate keys', () => {
    const keys = COUNTERS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
    const distinctKeys = DISTINCT_SETS.map((d) => d.key)
    expect(new Set(distinctKeys).size).toBe(distinctKeys.length)
  })

  it('excludes planned measures from the live list', () => {
    // A rule referencing a planned measure produces a trophy nobody can earn, with no error —
    // so the admin UI must be able to tell them apart.
    expect(liveCounters().every((c) => c.availability !== 'planned')).toBe(true)
    expect(liveCounters().length).toBeLessThan(COUNTERS.length)
  })

  it('describes every counter it declares', () => {
    for (const counter of COUNTERS) {
      expect(counter.label.length, `${counter.key} needs a label`).toBeGreaterThan(0)
      expect(counter.description.length, `${counter.key} needs a description`).toBeGreaterThan(0)
      expect(isKnownCounter(counter.key)).toBe(true)
    }
  })
})
