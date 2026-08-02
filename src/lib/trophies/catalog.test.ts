import { describe, it, expect } from 'vitest'
import { LAUNCH_CATALOG, criteriaUsesLiveMeasures, referencedKeys, scopeCriteriaToGame } from './catalog'
import { parseCriteria } from './criteria'

describe('the launch catalog', () => {
  it('has unique ids', () => {
    const ids = LAUNCH_CATALOG.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('parses every rule', () => {
    // A rule that doesn't parse is silently unearnable — no error, no trophy, ever.
    for (const trophy of LAUNCH_CATALOG) {
      expect(parseCriteria(trophy.criteria), `${trophy.id} has an unparseable rule`).not.toBeNull()
    }
  })

  it('only references measures that actually fire', () => {
    // This is the assertion that matters. A trophy written against a `planned` counter looks
    // perfectly fine in the admin UI and is simply never earned by anyone — so it should fail
    // in CI now, not go unnoticed until someone asks why nobody has it.
    for (const trophy of LAUNCH_CATALOG) {
      const check = criteriaUsesLiveMeasures(trophy.criteria)
      expect(check.ok, `${trophy.id} references ${check.unknown.join(', ')}`).toBe(true)
    }
  })

  it('stays inside the column bounds the migration enforces', () => {
    for (const trophy of LAUNCH_CATALOG) {
      expect(trophy.title.length, `${trophy.id} title`).toBeLessThanOrEqual(80)
      expect(trophy.description.length, `${trophy.id} description`).toBeLessThanOrEqual(300)
      expect(trophy.points, `${trophy.id} points`).toBeGreaterThanOrEqual(0)
      expect(trophy.points, `${trophy.id} points`).toBeLessThanOrEqual(1000)
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(trophy.tier)
    }
  })

  it('orders harder trophies above easier ones of the same family', () => {
    const points = (id: string) => LAUNCH_CATALOG.find((t) => t.id === id)!.points
    expect(points('fifty_wins')).toBeGreaterThan(points('ten_wins'))
    expect(points('ten_wins')).toBeGreaterThan(points('first_win'))
    expect(points('streak_30')).toBeGreaterThan(points('streak_7'))
  })
})

describe('referencedKeys', () => {
  it('finds keys nested inside combinators', () => {
    const keys = referencedKeys({
      type: 'all',
      of: [
        { type: 'counter', counter: 'games_won', gte: 1 },
        { type: 'any', of: [{ type: 'distinct', key: 'modes_played', gte: 2 }] },
      ],
    })
    expect(keys.counters).toEqual(['games_won'])
    expect(keys.distinct).toEqual(['modes_played'])
  })

  it('is safe on junk', () => {
    expect(referencedKeys(null)).toEqual({ counters: [], distinct: [] })
    expect(referencedKeys('nope')).toEqual({ counters: [], distinct: [] })
  })
})

describe('criteriaUsesLiveMeasures', () => {
  it('rejects a typo', () => {
    const check = criteriaUsesLiveMeasures({ type: 'counter', counter: 'gaems_won', gte: 1 })
    expect(check.ok).toBe(false)
    expect(check.unknown).toEqual(['gaems_won'])
  })

  it('rejects a measure that exists but is not emitted yet', () => {
    // `perfect_games` is declared in the vocabulary but nothing emits it. Saving a rule against
    // it would create a trophy nobody can earn, which is exactly what this guard is for.
    const check = criteriaUsesLiveMeasures({ type: 'counter', counter: 'perfect_games', gte: 1 })
    expect(check.ok).toBe(false)
    expect(check.unknown).toEqual(['perfect_games'])
  })

  it('accepts a rule built from live measures', () => {
    expect(criteriaUsesLiveMeasures({ type: 'counter', counter: 'games_won', gte: 3 }).ok).toBe(true)
  })
})

describe('scopeCriteriaToGame', () => {
  it('scopes a bare counter to the game', () => {
    expect(scopeCriteriaToGame({ type: 'counter', counter: 'games_won', gte: 5 }, 'whot')).toEqual({
      type: 'counter',
      counter: 'games_won',
      gte: 5,
      gameType: 'whot',
    })
  })

  it('reaches counters nested inside combinators', () => {
    const scoped = scopeCriteriaToGame(
      { type: 'all', of: [{ type: 'counter', counter: 'games_won', gte: 5 }] },
      'chess'
    ) as { of: { gameType: string }[] }
    expect(scoped.of[0].gameType).toBe('chess')
  })

  it('leaves an explicitly scoped counter alone', () => {
    // So a deliberate cross-game clause inside a game-specific trophy still works.
    const scoped = scopeCriteriaToGame({ type: 'counter', counter: 'games_won', gte: 5, gameType: 'uno' }, 'whot') as {
      gameType: string
    }
    expect(scoped.gameType).toBe('uno')
  })

  it('leaves distinct sets alone — they are cross-game by nature', () => {
    const rule = { type: 'distinct', key: 'modes_played', gte: 5 }
    expect(scopeCriteriaToGame(rule, 'whot')).toEqual(rule)
  })

  it('is a no-op for an all-games trophy', () => {
    const rule = { type: 'counter', counter: 'games_won', gte: 5 }
    expect(scopeCriteriaToGame(rule, null)).toEqual(rule)
  })
})
