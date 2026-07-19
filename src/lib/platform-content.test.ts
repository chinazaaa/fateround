import { describe, it, expect } from 'vitest'
import { platformGameDef, platformGameList } from './platform-content'
import { MLT_QUESTIONS } from './most-likely-to-questions'

describe('platform-content: most_likely_to', () => {
  const def = platformGameDef('most_likely_to')!

  it('is registered', () => {
    expect(def).toBeTruthy()
    expect(platformGameList().some((g) => g.gameType === 'most_likely_to')).toBe(true)
  })

  it('parse → toText round-trips, preserving commas in prompts', () => {
    const text = ['Who is most likely to laugh, cry, and scream at once?', 'Who is most likely to sleep in?'].join('\n')
    const parsed = def.parse(text)
    expect(parsed.entries).toEqual([
      'Who is most likely to laugh, cry, and scream at once?',
      'Who is most likely to sleep in?',
    ])
    // Serializing back and re-parsing is idempotent.
    const reparsed = def.parse(def.toText(parsed.entries))
    expect(reparsed.entries).toEqual(parsed.entries)
  })

  it('dedupes case-insensitively and drops a header line', () => {
    const parsed = def.parse(['question', 'Alpha prompt', 'alpha prompt', 'Beta prompt'].join('\n'))
    expect(parsed.entries).toEqual(['Alpha prompt', 'Beta prompt'])
    expect(parsed.duplicateRows).toBe(1)
  })

  it('the built-in batch matches the hardcoded array', () => {
    const builtin = def.builtins.find((b) => b.key === 'default')!
    expect(builtin.entries).toEqual(MLT_QUESTIONS)
    expect(builtin.entries.length).toBeGreaterThanOrEqual(def.minEntries)
  })
})

describe('platform-content: two-option banks (would_you_rather / this_or_that)', () => {
  const def = platformGameDef('would_you_rather')!

  it('parse → toText round-trips, preserving commas via CSV quoting', () => {
    const text = ['option_a,option_b', '"Pizza, always","Tacos, obviously"', 'Cats,Dogs'].join('\n')
    const parsed = def.parse(text)
    expect(parsed.entries).toEqual([
      { optionA: 'Pizza, always', optionB: 'Tacos, obviously' },
      { optionA: 'Cats', optionB: 'Dogs' },
    ])
    const reparsed = def.parse(def.toText(parsed.entries))
    expect(reparsed.entries).toEqual(parsed.entries)
  })

  it('this_or_that is registered and shares the shape', () => {
    expect(platformGameDef('this_or_that')).toBeTruthy()
  })
})

describe('platform-content: prompt banks stored as strings (quiplash / quick_draw draw)', () => {
  it('quiplash builtin is flattened to strings', () => {
    const def = platformGameDef('quiplash')!
    expect(def.builtins[0].entries.every((e) => typeof e === 'string')).toBe(true)
  })

  it('quick_draw uses the lie variant (guess mode not wired yet)', () => {
    expect(platformGameDef('quick_draw', 'lie')).toBeTruthy()
    expect(platformGameDef('quick_draw')).toBeUndefined() // must specify the variant
    expect(platformGameDef('quick_draw', 'guess')).toBeUndefined()
  })
})

describe('platform-content: every registered game seeds enough builtins', () => {
  it('builtin batches meet each def minEntries', () => {
    for (const meta of platformGameList()) {
      const def = platformGameDef(meta.gameType, meta.variant)!
      const total = def.builtins.reduce((n, b) => n + b.entries.length, 0)
      expect(total, `${meta.gameType}:${meta.variant ?? ''}`).toBeGreaterThanOrEqual(def.minEntries)
    }
  })
})
