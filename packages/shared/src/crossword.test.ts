import { describe, expect, it } from 'vitest'
import { tallyCrosswordScores, type CrosswordMetadata, type CrosswordSubmission } from './crossword'

const META: CrosswordMetadata = {
  size: 5,
  blocked: [
    [false, false, false, true, true],
    [false, true, true, true, true],
    [false, true, true, true, true],
    [true, true, true, true, true],
    [true, true, true, true, true],
  ],
  numbers: [
    [1, 0, 0, 0, 0],
    [2, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  clues: [
    { number: 1, direction: 'across', row: 0, col: 0, length: 3, clue: 'across word' },
    { number: 1, direction: 'down', row: 0, col: 0, length: 3, clue: 'down word' },
  ],
}

const PLAYERS = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Ben' },
]

const at = (s: number) => `2026-07-12T00:00:${String(s).padStart(2, '0')}.000Z`
function sub(player_id: string, cell_row: number, cell_col: number, s: number): CrosswordSubmission {
  return {
    id: `${player_id}-${cell_row}-${cell_col}-${s}`,
    game_id: 'G',
    round_id: 'R',
    player_id,
    cell_row,
    cell_col,
    submitted_letter: 'A',
    is_correct: true,
    via_hint: false,
    submitted_at: at(s),
  }
}

describe('tallyCrosswordScores tie-break (shared / mobile copy)', () => {
  it('is not pushed down by a duplicate correct row for an already-solved cell', () => {
    const subs = [
      sub('p1', 0, 0, 1),
      sub('p1', 0, 1, 2),
      sub('p1', 0, 2, 3),
      sub('p1', 1, 0, 10),
      sub('p1', 2, 0, 11),
      sub('p2', 0, 0, 4),
      sub('p2', 1, 0, 5),
      sub('p2', 2, 0, 6),
      sub('p2', 0, 1, 7),
      sub('p2', 0, 2, 8),
      sub('p2', 0, 0, 20),
    ]
    const scores = tallyCrosswordScores(META, subs, PLAYERS)
    expect(scores[0]!.points).toBe(scores[1]!.points)
    expect(scores[0]!.player_id).toBe('p2')
  })

  it('ranks a tie by when the score was reached, not by later partial progress', () => {
    const subs = [
      sub('p1', 0, 0, 1),
      sub('p1', 0, 1, 2),
      sub('p1', 0, 2, 3),
      sub('p2', 1, 0, 4),
      sub('p2', 2, 0, 5),
      sub('p2', 0, 0, 6),
      sub('p1', 1, 0, 30),
    ]
    const scores = tallyCrosswordScores(META, subs, PLAYERS)
    expect(scores[0]!.points).toBe(scores[1]!.points)
    expect(scores[0]!.player_id).toBe('p1')
  })
})
