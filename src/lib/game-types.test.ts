import { describe, it, expect } from 'vitest'
import { parseGameType, gameTypeConfig, GAME_TYPE_OPTIONS, isChessGame, isScrabbleGame } from './game-types'

describe('parseGameType', () => {
  it('returns known game types unchanged', () => {
    expect(parseGameType('chess')).toBe('chess')
    expect(parseGameType('scrabble')).toBe('scrabble')
  })
  it('falls back to the default for unknown / non-string input', () => {
    expect(parseGameType('not_a_game')).toBe('smash_marry_kill')
    expect(parseGameType(undefined)).toBe('smash_marry_kill')
    expect(parseGameType(42)).toBe('smash_marry_kill')
  })
})

describe('type guards', () => {
  it('match only their own game type', () => {
    expect(isChessGame('chess')).toBe(true)
    expect(isChessGame('scrabble')).toBe(false)
    expect(isScrabbleGame('scrabble')).toBe(true)
    expect(isScrabbleGame('chess')).toBe(false)
  })
})

describe('GAME_TYPE_OPTIONS / config completeness', () => {
  it('every listed option resolves to a config with an id and a label', () => {
    for (const id of GAME_TYPE_OPTIONS) {
      const cfg = gameTypeConfig(id)
      expect(cfg, id).toBeDefined()
      expect(cfg.id).toBe(id)
      expect(typeof cfg.label).toBe('string')
      expect(cfg.label.length).toBeGreaterThan(0)
    }
  })
})
