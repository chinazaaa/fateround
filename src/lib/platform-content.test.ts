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

  it('quick_draw requires an explicit variant (lie or guess)', () => {
    expect(platformGameDef('quick_draw', 'lie')).toBeTruthy()
    expect(platformGameDef('quick_draw', 'guess')).toBeTruthy()
    expect(platformGameDef('quick_draw')).toBeUndefined() // must specify the variant
  })
})

describe('platform-content: word-pool games (codewords / describe_it / quick_draw guess)', () => {
  it('codewords is registered with a board-sized minimum', () => {
    const def = platformGameDef('codewords')!
    expect(def).toBeTruthy()
    expect(def.minEntries).toBeGreaterThanOrEqual(25)
    expect(def.builtins[0].entries.length).toBeGreaterThanOrEqual(def.minEntries)
  })

  it('describe_it (Text Charades) is registered', () => {
    expect(platformGameDef('describe_it')).toBeTruthy()
  })

  it('quick_draw guess is a distinct variant from lie', () => {
    expect(platformGameDef('quick_draw', 'guess')).toBeTruthy()
    expect(platformGameDef('quick_draw', 'lie')).toBeTruthy()
    expect(platformGameDef('quick_draw', 'guess')).not.toBe(platformGameDef('quick_draw', 'lie'))
  })

  it('all 10 flat-bank defs are registered', () => {
    expect(platformGameList().length).toBe(10)
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
