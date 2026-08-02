import { describe, it, expect } from 'vitest'
import {
  describeCondition,
  describeRule,
  fromCriteria,
  measureLabel,
  toCriteria,
  type SimpleRule,
} from './rule-builder'
import { parseCriteria } from './criteria'

const single: SimpleRule = { combinator: 'all', conditions: [{ measure: 'games_won', kind: 'counter', gte: 25 }] }

describe('toCriteria', () => {
  it('emits a bare condition without a wrapper', () => {
    // Keeps stored rules readable and diffs small — an `all` of one says nothing extra.
    expect(toCriteria(single)).toEqual({ type: 'counter', counter: 'games_won', gte: 25 })
  })

  it('wraps several conditions in the chosen combinator', () => {
    expect(
      toCriteria({
        combinator: 'any',
        conditions: [
          { measure: 'games_won', kind: 'counter', gte: 5 },
          { measure: 'modes_played', kind: 'distinct', gte: 3 },
        ],
      })
    ).toEqual({
      type: 'any',
      of: [
        { type: 'counter', counter: 'games_won', gte: 5 },
        { type: 'distinct', key: 'modes_played', gte: 3 },
      ],
    })
  })

  it('always produces something the evaluator accepts', () => {
    // The builder and the evaluator are separate code paths; this is the seam where a rule
    // could be constructed that saves fine and then never matches anything.
    expect(parseCriteria(toCriteria(single))).not.toBeNull()
    expect(
      parseCriteria(
        toCriteria({
          combinator: 'all',
          conditions: [
            { measure: 'games_won', kind: 'counter', gte: 1 },
            { measure: 'modes_played', kind: 'distinct', gte: 2 },
          ],
        })
      )
    ).not.toBeNull()
  })
})

describe('fromCriteria', () => {
  it('round-trips a single condition', () => {
    expect(fromCriteria(toCriteria(single))).toEqual(single)
  })

  it('round-trips a combinator', () => {
    const rule: SimpleRule = {
      combinator: 'all',
      conditions: [
        { measure: 'games_won', kind: 'counter', gte: 10 },
        { measure: 'modes_played', kind: 'distinct', gte: 5 },
      ],
    }
    expect(fromCriteria(toCriteria(rule))).toEqual(rule)
  })

  it('reads a game-scoped counter, since the picker is what scoped it', () => {
    const parsed = fromCriteria({ type: 'counter', counter: 'games_won', gte: 5, gameType: 'whot' })
    expect(parsed?.conditions[0]).toEqual({ measure: 'games_won', kind: 'counter', gte: 5 })
  })

  it.each([
    ['junk', 'nope'],
    ['an unknown node type', { type: 'regex', pattern: '.*' }],
    ['a combinator over an unknown node', { type: 'all', of: [{ type: 'regex' }] }],
    ['an empty combinator', { type: 'any', of: [] }],
    ['a missing threshold', { type: 'counter', counter: 'games_won' }],
  ])('returns null for %s so the editor falls back to raw JSON', (_label, input) => {
    // Showing a simplified version of a rule the builder can't represent would let someone save
    // it back and quietly lose whatever it actually said.
    expect(fromCriteria(input)).toBeNull()
  })
})

describe('describeRule', () => {
  it('reads as English, not as the JSON spoken aloud', () => {
    expect(describeRule(single)).toBe('Earned when the player has won at least 25 games.')
  })

  it('says which game it counts when the trophy is scoped', () => {
    expect(describeRule(single, 'Whot')).toBe(
      'Earned when the player has won at least 25 games — counting Whot games only.'
    )
  })

  it('joins with "and" for all, "or" for any', () => {
    const conditions: SimpleRule['conditions'] = [
      { measure: 'games_won', kind: 'counter', gte: 5 },
      { measure: 'modes_played', kind: 'distinct', gte: 3 },
    ]
    expect(describeRule({ combinator: 'all', conditions })).toContain(' and ')
    expect(describeRule({ combinator: 'any', conditions })).toContain(' or ')
  })
})

describe('measureLabel', () => {
  it('uses the friendly label', () => {
    expect(measureLabel('games_won')).toBe('Games won')
    expect(measureLabel('modes_played')).toBe('Game modes played')
  })

  it('falls back to the key so an unknown measure is still visible', () => {
    expect(measureLabel('mystery_stat')).toBe('mystery_stat')
  })
})

describe('describeCondition', () => {
  it('uses the measure’s own verb rather than its label', () => {
    // "won at least 25 games" is checkable at a glance; "games won of at least 25" is the
    // stored format read out loud, which is what the JSON box already did badly.
    expect(describeCondition({ measure: 'games_won', kind: 'counter', gte: 25 })).toBe('won at least 25 games')
    expect(describeCondition({ measure: 'modes_played', kind: 'distinct', gte: 5 })).toBe(
      'played at least 5 different game modes'
    )
  })

  it('drops the plural at 1', () => {
    // "at least 1 games" is the giveaway that nobody read the sentence.
    expect(describeCondition({ measure: 'games_won', kind: 'counter', gte: 1 })).toBe('won at least 1 game')
    expect(describeCondition({ measure: 'modes_played', kind: 'distinct', gte: 1 })).toBe(
      'played at least 1 different game mode'
    )
  })

  it('stays truthful for a measure it has no verb for', () => {
    expect(describeCondition({ measure: 'mystery_stat', kind: 'counter', gte: 3 })).toBe(
      'reached mystery_stat of at least 3'
    )
  })
})
