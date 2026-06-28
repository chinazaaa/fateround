import { describe, it, expect } from 'vitest'
import { isCompetitiveRoomGame, ROOM_POINTS } from './room-points'
import type { GameType } from '@/types'

describe('ROOM_POINTS', () => {
  it('placements descend and all values are positive', () => {
    expect(ROOM_POINTS.first).toBeGreaterThan(ROOM_POINTS.second)
    expect(ROOM_POINTS.second).toBeGreaterThan(ROOM_POINTS.third)
    for (const v of Object.values(ROOM_POINTS)) expect(v).toBeGreaterThan(0)
  })
})

describe('isCompetitiveRoomGame', () => {
  const competitive: GameType[] = [
    'monopoly',
    'yahtzee',
    'whot',
    'ludo',
    'snake_and_ladder',
    'bingo',
    'codewords',
    'sudoku',
    'word_hunt',
    'trivia',
  ]
  const nonCompetitive: GameType[] = ['smash_marry_kill', 'would_you_rather', 'hot_seat', 'custom', 'secret_message']

  it('classifies the competitive games as competitive', () => {
    for (const g of competitive) expect(isCompetitiveRoomGame(g), g).toBe(true)
  })
  it('does not classify poll/social games as competitive', () => {
    for (const g of nonCompetitive) expect(isCompetitiveRoomGame(g), g).toBe(false)
  })
})
