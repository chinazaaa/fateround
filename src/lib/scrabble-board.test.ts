import { describe, it, expect } from 'vitest'
import {
  emptyScrabbleBoard,
  withPlacedTiles,
  scorePlacement,
  validatePlacementGeometry,
  tileScore,
} from './scrabble-board'
import { SCRABBLE_TILE_SETS } from './scrabble-rulesets'
import type { ScrabblePlacedTile } from '@/types'

const EN = SCRABBLE_TILE_SETS.english.values

describe('tileScore', () => {
  it('scores a letter by its value', () => {
    expect(tileScore('Q', false, EN)).toBe(10)
    expect(tileScore('a', false, EN)).toBe(1) // case-insensitive
  })
  it('scores a blank as 0 regardless of letter', () => {
    expect(tileScore('Q', true, EN)).toBe(0)
  })
})

describe('scorePlacement (English)', () => {
  it('scores the first word across the neutral centre — CAT = 5', () => {
    const cat: ScrabblePlacedTile[] = [
      { row: 7, col: 6, letter: 'C', isBlank: false },
      { row: 7, col: 7, letter: 'A', isBlank: false },
      { row: 7, col: 8, letter: 'T', isBlank: false },
    ]
    const r = scorePlacement(emptyScrabbleBoard(), cat, EN)
    expect(r.valid).toBe(true)
    expect(r.score).toBe(5) // 3+1+1 — centre is neutral, no word multiplier
    expect(r.words).toEqual(['CAT'])
  })

  it('scores a connecting word using an existing tile — TOP = 7', () => {
    let board = emptyScrabbleBoard()
    board = withPlacedTiles(board, [
      { row: 7, col: 6, letter: 'C', isBlank: false },
      { row: 7, col: 7, letter: 'A', isBlank: false },
      { row: 7, col: 8, letter: 'T', isBlank: false },
    ])
    const top: ScrabblePlacedTile[] = [
      { row: 8, col: 8, letter: 'O', isBlank: false },
      { row: 9, col: 8, letter: 'P', isBlank: false },
    ]
    const r = scorePlacement(board, top, EN)
    expect(r.valid).toBe(true)
    expect(r.score).toBe(7) // T1 + O(1×3 TL at 8,8) + P3
    expect(r.words).toEqual(['TOP'])
  })

  it('adds the 50-point full-rack bonus for using all 7 tiles', () => {
    const seven: ScrabblePlacedTile[] = 'AEINRST'.split('').map((ch, i) => ({
      row: 7,
      col: 4 + i,
      letter: ch,
      isBlank: false,
    }))
    const r = scorePlacement(emptyScrabbleBoard(), seven, EN)
    expect(r.valid).toBe(true)
    // First and last tiles land on TW squares at (7,4) and (7,10); the seven
    // one-point letters sum to 7, doubled by two triple-word multipliers (×3×3 = ×9),
    // plus the 50-point bonus for using all 7 tiles → 7×9 + 50 = 113.
    expect(r.score).toBe(113)
  })

  it('scores a blank tile as 0 within the word', () => {
    let board = emptyScrabbleBoard()
    board = withPlacedTiles(board, [
      { row: 7, col: 6, letter: 'C', isBlank: false },
      { row: 7, col: 7, letter: 'A', isBlank: false },
      { row: 7, col: 8, letter: 'T', isBlank: false },
    ])
    const r = scorePlacement(board, [{ row: 7, col: 9, letter: 'S', isBlank: true }], EN)
    expect(r.valid).toBe(true)
    expect(r.score).toBe(5) // C3 + A1 + T1 + S0
  })
})

describe('validatePlacementGeometry', () => {
  it('rejects a single tile on an empty board (first word must be ≥2)', () => {
    expect(validatePlacementGeometry(emptyScrabbleBoard(), [{ row: 7, col: 7, letter: 'A', isBlank: false }]).ok).toBe(
      false
    )
  })
  it('rejects a first word that misses the centre', () => {
    const off: ScrabblePlacedTile[] = [
      { row: 0, col: 0, letter: 'A', isBlank: false },
      { row: 0, col: 1, letter: 'T', isBlank: false },
    ]
    expect(validatePlacementGeometry(emptyScrabbleBoard(), off).ok).toBe(false)
  })
  it('rejects a disconnected later move', () => {
    let board = emptyScrabbleBoard()
    board = withPlacedTiles(board, [
      { row: 7, col: 7, letter: 'A', isBlank: false },
      { row: 7, col: 8, letter: 'T', isBlank: false },
    ])
    const far: ScrabblePlacedTile[] = [
      { row: 0, col: 0, letter: 'X', isBlank: false },
      { row: 0, col: 1, letter: 'I', isBlank: false },
    ]
    expect(validatePlacementGeometry(board, far).ok).toBe(false)
  })
})
