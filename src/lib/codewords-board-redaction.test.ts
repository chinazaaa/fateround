import { describe, expect, it } from 'vitest'
import type { CodewordsBoard, CodewordsCellType } from '../../packages/shared/src/types'
import {
  codewordsKeyIsMasked,
  countTeamCells,
  mergeCodewordsBoardUpdate,
  teamCellTotal,
} from '../../packages/shared/src/codewords'

/**
 * The mobile Codewords client reads the board through /api/codewords/board, which masks the key
 * for anyone who isn't a spymaster/host. These helpers are what keep a REDACTED read from being
 * rendered as game state (a blank grid, or a scoreboard claiming both teams already won).
 * Imported from packages/shared because that is the copy mobile uses; web's equivalents live in
 * src/lib/codewords.ts.
 */

const fullKey: CodewordsCellType[] = [
  'red',
  'red',
  'red',
  'blue',
  'blue',
  'neutral',
  'assassin',
  'blue',
  'red',
  'neutral',
]

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
  }
}

/** What the route hands an operative: true colours only at revealed indices. */
function masked(revealed: number[]): CodewordsBoard {
  return board({
    revealed_indices: revealed,
    key: fullKey.map((cell, index) => (revealed.includes(index) ? cell : null)),
    key_totals: { red: 4, blue: 3, neutral: 2, assassin: 1 },
  })
}

describe('codewordsKeyIsMasked', () => {
  it('is false for a spymaster board', () => {
    expect(codewordsKeyIsMasked(board())).toBe(false)
  })

  it('is true while any unrevealed cell has no colour', () => {
    expect(codewordsKeyIsMasked(masked([0, 3]))).toBe(true)
  })

  it('is false once every cell is revealed (nothing is withheld any more)', () => {
    const all = fullKey.map((_, i) => i)
    expect(codewordsKeyIsMasked(masked(all))).toBe(false)
  })
})

describe('teamCellTotal', () => {
  it('counts the key when it is unmasked', () => {
    expect(teamCellTotal(board(), 'red')).toBe(4)
    expect(teamCellTotal(board(), 'blue')).toBe(3)
  })

  it('uses key_totals on a masked key — counting it would report "already found everything"', () => {
    const operativeBoard = masked([0, 3])
    // The bug this guards: one revealed red cell counted as the whole red team's target.
    expect(countTeamCells(operativeBoard.key, 'red')).toBe(1)
    expect(teamCellTotal(operativeBoard, 'red')).toBe(4)
    expect(teamCellTotal(operativeBoard, 'blue')).toBe(3)
  })
})

describe('mergeCodewordsBoardUpdate', () => {
  it('keeps the key we already hold when the realtime payload omits it', () => {
    const prev = board()
    const incoming = { ...board({ revealed_indices: [2] }), key: undefined } as unknown as CodewordsBoard
    const merged = mergeCodewordsBoardUpdate(prev, incoming)
    expect(merged?.key).toEqual(fullKey)
    expect(merged?.revealed_indices).toEqual([2])
  })

  it('keeps key_totals across an update that omits them', () => {
    const prev = masked([0])
    const incoming = {
      ...board({ revealed_indices: [0, 1] }),
      key: undefined,
      key_totals: undefined,
    } as unknown as CodewordsBoard
    expect(mergeCodewordsBoardUpdate(prev, incoming)?.key_totals).toEqual(prev.key_totals)
  })

  it('replaces wholesale when the board row itself changed (new round, new key)', () => {
    const prev = board()
    const incoming = board({ id: 'board-2', key: [...fullKey].reverse() })
    expect(mergeCodewordsBoardUpdate(prev, incoming)).toBe(incoming)
  })

  it('a delete clears the board', () => {
    expect(mergeCodewordsBoardUpdate(board(), null)).toBeNull()
  })
})
