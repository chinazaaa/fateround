import { describe, it, expect } from 'vitest'
import { parsePuzzleThemeCsv, puzzleThemeEntriesToCsv } from './puzzle-themes'

/**
 * The edit-theme form serializes stored entries back to CSV so an admin can edit lines. That CSV
 * must round-trip cleanly back through the same parser the create/upload path uses — including
 * fields containing commas (crossword clues) which require CSV quoting.
 */
describe('puzzleThemeEntriesToCsv round-trips through parsePuzzleThemeCsv', () => {
  it('crossword: preserves answers and clues, including commas in clues', () => {
    const entries = [
      { answer: 'PARIS', clue: 'Capital of France' },
      { answer: 'NILE', clue: 'A long river, mostly in Egypt' }, // comma must survive
      { answer: 'EIFFEL', clue: 'Famous "iron" tower' }, // quote must survive
    ]
    const csv = puzzleThemeEntriesToCsv('crossword', entries)
    const parsed = parsePuzzleThemeCsv('crossword', csv)
    expect(parsed.entries).toEqual(entries)
  })

  it('word_search: preserves single-column words', () => {
    const entries = [{ word: 'ALPHA' }, { word: 'BRAVO' }, { word: 'CHARLIE' }]
    const csv = puzzleThemeEntriesToCsv('word_search', entries)
    const parsed = parsePuzzleThemeCsv('word_search', csv)
    expect(parsed.entries).toEqual(entries)
  })

  it('word_scramble: preserves words and optional hints', () => {
    const entries = [{ word: 'OCEAN', hint: 'Big blue' }, { word: 'RIVER' }]
    const csv = puzzleThemeEntriesToCsv('word_scramble', entries)
    const parsed = parsePuzzleThemeCsv('word_scramble', csv)
    expect(parsed.entries).toEqual(entries)
  })
})
