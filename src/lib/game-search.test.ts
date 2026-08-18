import { describe, it, expect } from 'vitest'
import { GAME_TYPE_OPTIONS, GAME_CATEGORIES, gameTypeCategory } from '@/lib/game-types'
import { matchesGameSearch } from '@/lib/game-search'
import type { GameType } from '@/types'

describe('matchesGameSearch', () => {
  it('matches on the human label', () => {
    expect(matchesGameSearch('never_have_i_ever' as GameType, 'never have i ever')).toBe(true)
  })

  it('matches on the underscored game type, so "smash or pass" finds smash_or_pass', () => {
    expect(matchesGameSearch('smash_or_pass' as GameType, 'smash or pass')).toBe(true)
  })

  it('is case-insensitive and trims the query', () => {
    expect(matchesGameSearch('trivia' as GameType, '  TRIVIA  ')).toBe(true)
  })

  it('returns everything for an empty query', () => {
    expect(matchesGameSearch('trivia' as GameType, '   ')).toBe(true)
  })

  it('folds in caller-supplied extra fields', () => {
    expect(matchesGameSearch('trivia' as GameType, 'zzzunlikely')).toBe(false)
    expect(matchesGameSearch('trivia' as GameType, 'zzzunlikely', ['zzzunlikely hero copy'])).toBe(true)
  })

  it('does not match unrelated queries', () => {
    expect(matchesGameSearch('chess' as GameType, 'never have i ever')).toBe(false)
  })

  it('matches "draughts" as an alias for checkers', () => {
    expect(matchesGameSearch('checkers' as GameType, 'draughts')).toBe(true)
  })

  it('matches "international draughts" and "flying kings" as aliases for checkers_international', () => {
    expect(matchesGameSearch('checkers_international' as GameType, 'international draughts')).toBe(true)
    expect(matchesGameSearch('checkers_international' as GameType, 'flying kings')).toBe(true)
  })

  it('matches "naija checkers" and "nigerian draughts" as aliases for checkers_nigeria', () => {
    expect(matchesGameSearch('checkers_nigeria' as GameType, 'naija checkers')).toBe(true)
    expect(matchesGameSearch('checkers_nigeria' as GameType, 'nigerian draughts')).toBe(true)
  })

  it('still finds renamed games by the original trademark', () => {
    expect(matchesGameSearch('monopoly' as GameType, 'monopoly')).toBe(true)
    expect(matchesGameSearch('scrabble' as GameType, 'scrabble')).toBe(true)
    expect(matchesGameSearch('yahtzee' as GameType, 'yahtzee')).toBe(true)
    expect(matchesGameSearch('uno' as GameType, 'uno')).toBe(true)
    expect(matchesGameSearch('quiplash' as GameType, 'quiplash')).toBe(true)
  })
})

describe('game categories', () => {
  // gameTypeCategory silently falls back to 'party', so a game missing from the map would
  // land in Party unnoticed — and the /games category counts would quietly be wrong.
  it('assigns every game type to a declared category', () => {
    const declared = new Set(GAME_CATEGORIES.map((c) => c.key))
    for (const type of GAME_TYPE_OPTIONS) {
      expect(declared.has(gameTypeCategory(type))).toBe(true)
    }
  })

  it('category counts partition the full catalogue', () => {
    const total = GAME_CATEGORIES.reduce(
      (sum, c) => sum + GAME_TYPE_OPTIONS.filter((t) => gameTypeCategory(t) === c.key).length,
      0
    )
    expect(total).toBe(GAME_TYPE_OPTIONS.length)
  })
})
