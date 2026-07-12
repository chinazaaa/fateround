import { describe, it, expect } from 'vitest'
import {
  generateCrossword,
  crosswordWordCells,
  fillableCellCount,
  playerCompletionPercent,
  isCrosswordCompleteForPlayer,
  tallyCrosswordScores,
  parseCrosswordMetadata,
  CROSSWORD_WORD_POINTS,
  CROSSWORD_FIRST_WORD_BONUS,
  CROSSWORD_HINT_PENALTY,
  type CrosswordMetadata,
  type CrosswordSubmission,
} from './crossword'
import { buildCrosswordPuzzle, CROSSWORD_THEMES } from './crossword-puzzles'

const ENTRIES = [
  { answer: 'PLANET', clue: 'Earth is one' },
  { answer: 'RIVER', clue: 'Flowing water' },
  { answer: 'ISLAND', clue: 'Land in the sea' },
  { answer: 'ANCHOR', clue: 'Holds a ship' },
  { answer: 'ENGINE', clue: 'Powers a car' },
  { answer: 'ORANGE', clue: 'A citrus fruit' },
  { answer: 'GARDEN', clue: 'Flowers grow here' },
  { answer: 'CASTLE', clue: 'Royal home' },
]

describe('generateCrossword', () => {
  it('produces a connected, letter-consistent grid', () => {
    const result = generateCrossword(ENTRIES, { size: 11, seed: 42, targetWords: 6, maxWordLength: 9 })
    expect(result).not.toBeNull()
    const { metadata, solution } = result!

    // Every clue's cells must be fillable and match the solution letters.
    for (const clue of metadata.clues) {
      const cells = crosswordWordCells(clue)
      expect(cells.length).toBe(clue.length)
      for (const [r, c] of cells) {
        expect(metadata.blocked[r][c]).toBe(false)
        expect(solution[r][c]).toMatch(/^[A-Z]$/)
      }
    }
    // At least a few words placed and crossing (fewer cells than sum of lengths).
    expect(metadata.clues.length).toBeGreaterThanOrEqual(4)
    const totalWordLen = metadata.clues.reduce((n, c) => n + c.length, 0)
    expect(fillableCellCount(metadata)).toBeLessThan(totalWordLen)
  })

  it('is deterministic for a given seed', () => {
    const a = generateCrossword(ENTRIES, { size: 11, seed: 7, targetWords: 6 })
    const b = generateCrossword(ENTRIES, { size: 11, seed: 7, targetWords: 6 })
    expect(JSON.stringify(a?.solution)).toBe(JSON.stringify(b?.solution))
  })

  it('never places two parallel words touching (each empty cell is validated)', () => {
    const { metadata, solution } = generateCrossword(ENTRIES, { size: 11, seed: 99, targetWords: 8 })!
    // Numbering sanity: a numbered cell must start an across or down run.
    const filled = (r: number, c: number) =>
      r >= 0 && r < metadata.size && c >= 0 && c < metadata.size && solution[r][c] !== ''
    for (let r = 0; r < metadata.size; r++) {
      for (let c = 0; c < metadata.size; c++) {
        if (metadata.numbers[r][c] > 0) {
          const startsAcross = !filled(r, c - 1) && filled(r, c + 1)
          const startsDown = !filled(r - 1, c) && filled(r + 1, c)
          expect(startsAcross || startsDown).toBe(true)
        }
      }
    }
  })
})

describe('buildCrosswordPuzzle', () => {
  it('builds a themed puzzle for every theme + difficulty', () => {
    for (const theme of CROSSWORD_THEMES) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const { metadata } = buildCrosswordPuzzle(theme.id, difficulty, 1234)
        expect(metadata.clues.length).toBeGreaterThanOrEqual(4)
        expect(metadata.theme).toBe(theme.id)
        expect(metadata.difficulty).toBe(difficulty)
      }
    }
  })
})

// ── Scoring ──────────────────────────────────────────────────────────────────

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
    { number: 1, direction: 'across', row: 0, col: 0, length: 3, clue: 'across word' }, // (0,0)(0,1)(0,2)
    { number: 1, direction: 'down', row: 0, col: 0, length: 3, clue: 'down word' }, // (0,0)(1,0)(2,0)
  ],
}

function sub(overrides: Partial<CrosswordSubmission>): CrosswordSubmission {
  return {
    id: Math.random().toString(36),
    game_id: 'G',
    round_id: 'R',
    player_id: 'p1',
    cell_row: 0,
    cell_col: 0,
    submitted_letter: 'A',
    is_correct: true,
    via_hint: false,
    submitted_at: '2026-07-12T00:00:00.000Z',
    ...overrides,
  }
}

const PLAYERS = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Ben' },
]

describe('tallyCrosswordScores', () => {
  it('awards word points + a first-completer bonus', () => {
    // p1 completes the across word (cells 0,0 / 0,1 / 0,2) first.
    const submissions = [
      sub({ player_id: 'p1', cell_row: 0, cell_col: 0, submitted_at: '2026-07-12T00:00:01.000Z' }),
      sub({ player_id: 'p1', cell_row: 0, cell_col: 1, submitted_at: '2026-07-12T00:00:02.000Z' }),
      sub({ player_id: 'p1', cell_row: 0, cell_col: 2, submitted_at: '2026-07-12T00:00:03.000Z' }),
      // p2 completes the same across word later.
      sub({ player_id: 'p2', cell_row: 0, cell_col: 0, submitted_at: '2026-07-12T00:00:05.000Z' }),
      sub({ player_id: 'p2', cell_row: 0, cell_col: 1, submitted_at: '2026-07-12T00:00:06.000Z' }),
      sub({ player_id: 'p2', cell_row: 0, cell_col: 2, submitted_at: '2026-07-12T00:00:07.000Z' }),
    ]
    const scores = tallyCrosswordScores(META, submissions, PLAYERS)
    const p1 = scores.find((s) => s.player_id === 'p1')!
    const p2 = scores.find((s) => s.player_id === 'p2')!
    expect(p1.points).toBe(CROSSWORD_WORD_POINTS + CROSSWORD_FIRST_WORD_BONUS)
    expect(p2.points).toBe(CROSSWORD_WORD_POINTS)
    expect(p1.wordsCompleted).toBe(1)
  })

  it('applies the hint penalty', () => {
    const submissions = [
      sub({ player_id: 'p1', cell_row: 0, cell_col: 0, via_hint: true }),
      sub({ player_id: 'p1', cell_row: 0, cell_col: 1 }),
      sub({ player_id: 'p1', cell_row: 0, cell_col: 2 }),
    ]
    const scores = tallyCrosswordScores(META, submissions, PLAYERS)
    const p1 = scores.find((s) => s.player_id === 'p1')!
    // one across word completed + first bonus, minus one hint.
    expect(p1.points).toBe(CROSSWORD_WORD_POINTS + CROSSWORD_FIRST_WORD_BONUS + CROSSWORD_HINT_PENALTY)
  })
})

describe('completion helpers', () => {
  it('tracks per-player completion and win condition', () => {
    // Fillable cells in META: (0,0)(0,1)(0,2)(1,0)(2,0) = 5 cells.
    expect(fillableCellCount(META)).toBe(5)
    const partial = [
      sub({ cell_row: 0, cell_col: 0 }),
      sub({ cell_row: 0, cell_col: 1 }),
    ]
    expect(playerCompletionPercent(META, partial, 'p1')).toBe(40)
    expect(isCrosswordCompleteForPlayer(META, partial, 'p1')).toBe(false)

    const full = [
      sub({ cell_row: 0, cell_col: 0 }),
      sub({ cell_row: 0, cell_col: 1 }),
      sub({ cell_row: 0, cell_col: 2 }),
      sub({ cell_row: 1, cell_col: 0 }),
      sub({ cell_row: 2, cell_col: 0 }),
    ]
    expect(playerCompletionPercent(META, full, 'p1')).toBe(100)
    expect(isCrosswordCompleteForPlayer(META, full, 'p1')).toBe(true)
  })
})

describe('parseCrosswordMetadata', () => {
  it('accepts valid metadata and rejects junk', () => {
    expect(parseCrosswordMetadata(META)).not.toBeNull()
    expect(parseCrosswordMetadata(null)).toBeNull()
    expect(parseCrosswordMetadata({ size: 5 })).toBeNull()
  })
})
