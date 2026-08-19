import { describe, it, expect } from 'vitest'
import {
  TROPHY_TEMPLATES,
  buildCatalogForGame,
  criteriaUsesLiveMeasures,
  referencedKeys,
  scopeCriteriaToGame,
} from './catalog'
import { parseCriteria } from './criteria'

const whot = buildCatalogForGame('whot', 'Whot', true)
const poll = buildCatalogForGame('never_have_i_ever', 'Never Have I Ever', false)

describe('buildCatalogForGame', () => {
  it('gives every trophy a game-scoped id and game_type', () => {
    // Ids are permanent once earned, so the game prefix is what keeps two games' "First win"
    // from colliding on one row.
    for (const trophy of whot) {
      expect(trophy.id.startsWith('whot.')).toBe(true)
      expect(trophy.game_type).toBe('whot')
    }
  })

  it('scopes each rule to the game, so a counter only reads that game', () => {
    for (const trophy of whot) {
      const crit = trophy.criteria as { type?: string; gameType?: string; game_type?: string }
      if (crit.type === 'platinum') {
        expect(crit.game_type).toBe('whot')
      } else {
        expect(crit.gameType).toBe('whot')
      }
    }
  })

  it('names the game in the description', () => {
    expect(whot.find((t) => t.id === 'whot.first_win')?.description).toContain('Whot')
  })

  it('SKIPS win trophies for a game whose winner the server cannot resolve', () => {
    // The point of the winner-capability work: for these games a win trophy isn't hard, it's
    // impossible, and it would sit in the list forever looking like a bug.
    expect(poll.some((t) => t.id.includes('win'))).toBe(false)
    expect(whot.some((t) => t.id.includes('win'))).toBe(true)
    // Play-count trophies still apply — those are universal.
    expect(poll.some((t) => t.id.endsWith('.first_game'))).toBe(true)
  })

  it('parses every generated rule', () => {
    for (const trophy of [...whot, ...poll]) {
      expect(parseCriteria(trophy.criteria), `${trophy.id} has an unparseable rule`).not.toBeNull()
    }
  })

  it('only references measures that actually fire', () => {
    for (const trophy of [...whot, ...poll]) {
      const check = criteriaUsesLiveMeasures(trophy.criteria)
      expect(check.ok, `${trophy.id} references ${check.unknown.join(', ')}`).toBe(true)
    }
  })

  it('stays inside the column bounds the migration enforces', () => {
    for (const trophy of whot) {
      expect(trophy.title.length, `${trophy.id} title`).toBeLessThanOrEqual(80)
      expect(trophy.description.length, `${trophy.id} description`).toBeLessThanOrEqual(300)
      expect(trophy.points).toBeGreaterThanOrEqual(0)
      expect(trophy.points).toBeLessThanOrEqual(1000)
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(trophy.tier)
    }
  })

  it('has unique template suffixes, so ids cannot collide within a game', () => {
    const suffixes = TROPHY_TEMPLATES.map((t) => t.suffix)
    expect(new Set(suffixes).size).toBe(suffixes.length)
  })

  it('prices harder trophies above easier ones', () => {
    const points = (id: string) => whot.find((t) => t.id === id)!.points
    expect(points('whot.fifty_wins')).toBeGreaterThan(points('whot.ten_wins'))
    expect(points('whot.ten_wins')).toBeGreaterThan(points('whot.first_win'))
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
