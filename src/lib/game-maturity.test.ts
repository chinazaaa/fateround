import { describe, it, expect } from 'vitest'
import { GAME_TYPE_OPTIONS, gameTypeCategory } from '@/lib/game-types'
import { MATURE_GAME_TYPES, isMatureGame, matureGameReason } from '@/lib/game-maturity'
import type { GameType } from '@/types'

describe('game maturity', () => {
  it('flags exactly the adult party games', () => {
    expect([...MATURE_GAME_TYPES].sort()).toEqual(
      ['hot_seat', 'never_have_i_ever', 'red_flag_green_flag', 'smash_marry_kill', 'smash_or_pass'].sort()
    )
  })

  it('every flagged game is a real game type', () => {
    for (const type of MATURE_GAME_TYPES) {
      expect(GAME_TYPE_OPTIONS).toContain(type)
    }
  })

  it('does not flag the family-friendly games used in schools', () => {
    for (const type of ['trivia', 'whot', 'chess', 'scrabble', 'crossword', 'sudoku'] as GameType[]) {
      expect(isMatureGame(type)).toBe(false)
    }
  })

  it('gives every flagged game a specific reason rather than the fallback', () => {
    const fallback = matureGameReason('trivia' as GameType)
    for (const type of MATURE_GAME_TYPES) {
      expect(matureGameReason(type)).not.toBe(fallback)
      expect(matureGameReason(type).length).toBeGreaterThan(20)
    }
  })

  it('keeps the flagged games inside the party category, where the 18+ badge is visible', () => {
    for (const type of MATURE_GAME_TYPES) {
      expect(gameTypeCategory(type)).toBe('party')
    }
  })
})
