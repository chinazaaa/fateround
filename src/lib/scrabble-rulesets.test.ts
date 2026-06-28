import { describe, it, expect } from 'vitest'
import { SCRABBLE_TILE_SETS, tileSetForDictionary } from './scrabble-rulesets'

const TOTALS: Record<string, number> = { english: 100, french: 102, german: 102, spanish: 97 }

describe('SCRABBLE_TILE_SETS', () => {
  for (const [lang, ts] of Object.entries(SCRABBLE_TILE_SETS)) {
    it(`${lang}: tile counts total ${TOTALS[lang]} with 2 blanks`, () => {
      const total = Object.values(ts.distribution).reduce((a, b) => a + b, 0)
      expect(total).toBe(TOTALS[lang])
      expect(ts.distribution['?']).toBe(2)
    })
    it(`${lang}: every alphabet letter has a value and a count`, () => {
      for (const letter of ts.alphabet) {
        expect(ts.values[letter], `${letter} value`).toBeTypeOf('number')
        expect(ts.distribution[letter], `${letter} count`).toBeGreaterThan(0)
      }
    })
  }

  it('encodes the known special-letter values', () => {
    expect(SCRABBLE_TILE_SETS.french.values['K']).toBe(10)
    expect(SCRABBLE_TILE_SETS.german.values['Ä']).toBe(6)
    expect(SCRABBLE_TILE_SETS.spanish.values['Ñ']).toBe(8)
  })

  it('omits K/W from the Spanish set', () => {
    expect(SCRABBLE_TILE_SETS.spanish.values['K']).toBeUndefined()
    expect(SCRABBLE_TILE_SETS.spanish.values['W']).toBeUndefined()
  })
})

describe('tileSetForDictionary', () => {
  it('maps English editions to the English tile set', () => {
    expect(tileSetForDictionary('enable')).toBe(SCRABBLE_TILE_SETS.english)
    expect(tileSetForDictionary('collins')).toBe(SCRABBLE_TILE_SETS.english)
    expect(tileSetForDictionary('twl')).toBe(SCRABBLE_TILE_SETS.english)
  })
  it('maps each language edition to its tile set', () => {
    expect(tileSetForDictionary('french')).toBe(SCRABBLE_TILE_SETS.french)
    expect(tileSetForDictionary('german')).toBe(SCRABBLE_TILE_SETS.german)
    expect(tileSetForDictionary('spanish')).toBe(SCRABBLE_TILE_SETS.spanish)
  })
  it('defaults to English for unknown / null', () => {
    expect(tileSetForDictionary('nope')).toBe(SCRABBLE_TILE_SETS.english)
    expect(tileSetForDictionary(null)).toBe(SCRABBLE_TILE_SETS.english)
    expect(tileSetForDictionary(undefined)).toBe(SCRABBLE_TILE_SETS.english)
  })
})
