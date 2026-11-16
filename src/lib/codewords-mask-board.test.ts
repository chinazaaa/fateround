import { describe, expect, it, vi } from 'vitest'
import type { CodewordsBoard, CodewordsCellType } from '@/types'

vi.mock('server-only', () => ({}))

import { maskCodewordsBoardKey } from '@/lib/codewords'

const fullKey: CodewordsCellType[] = ['red', 'red', 'blue', 'blue', 'neutral', 'assassin', 'red', 'blue']

function board(over: Partial<CodewordsBoard> = {}): CodewordsBoard {
  return {
    id: 'board-1',
    game_id: 'ABCD',
    words: fullKey.map((_, i) => `w${i}`),
    key: fullKey,
    starting_team: 'red',
    revealed_indices: [],
    current_turn: 'red',
    guesses_remaining: null,
    current_clue_word: null,
    current_clue_number: null,
    winner: null,
    assassin_team: null,
    spymaster_timer_seconds: 60,
    operative_timer_seconds: 60,
    turn_phase: 'clue',
    turn_deadline_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as CodewordsBoard
}

describe('maskCodewordsBoardKey', () => {
  it('hides every unrevealed cell and sends the team totals separately', () => {
    const masked = maskCodewordsBoardKey(board())
    expect(masked.key.every((cell) => cell === null)).toBe(true)
    expect(masked.key_totals).toEqual({ red: 3, blue: 3, neutral: 1, assassin: 1 })
  })

  it('keeps revealed cells, which every player has already seen', () => {
    const masked = maskCodewordsBoardKey(board({ revealed_indices: [0, 5] }))
    expect(masked.key).toEqual(['red', null, null, null, null, 'assassin', null, null])
  })

  it('does not mutate the stored board', () => {
    const original = board()
    maskCodewordsBoardKey(original)
    expect(original.key).toEqual(fullKey)
  })

  it('returns the board unchanged once there is a winner, because the key is no longer secret', () => {
    const finished = board({ winner: 'red' })
    expect(maskCodewordsBoardKey(finished)).toBe(finished)
  })
})
