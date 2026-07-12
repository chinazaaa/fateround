import { describe, it, expect } from 'vitest'
import {
  generateWordSearch,
  placementCells,
  placementEnd,
  selectionCells,
  matchSelectionToPlacement,
  wordSearchCompletionPercent,
  isWordSearchCompleteForPlayer,
  tallyWordSearchScores,
  parseWordSearchMetadata,
  WORD_SEARCH_WORD_POINTS,
  WORD_SEARCH_FIRST_BONUS,
  WORD_SEARCH_LENGTH_BONUS,
  WORD_SEARCH_HINT_PENALTY,
  type WordSearchMetadata,
  type WordSearchFound,
} from './word-search'
import { buildWordSearchPuzzle, WORD_SEARCH_THEMES } from './word-search-puzzles'

const WORDS = ['TIGER', 'PANDA', 'EAGLE', 'HORSE', 'MONKEY', 'RABBIT', 'ZEBRA', 'SNAKE']

describe('generateWordSearch', () => {
  it('plants every listed word so it is actually findable in the grid', () => {
    const result = generateWordSearch(WORDS, {
      size: 12,
      seed: 42,
      targetWords: 8,
      directions: ['E', 'S', 'SE', 'NE'],
    })
    expect(result).not.toBeNull()
    const { metadata, solution } = result!

    // Grid is fully filled with A–Z.
    expect(metadata.grid.length).toBe(12)
    for (const row of metadata.grid) for (const ch of row) expect(ch).toMatch(/^[A-Z]$/)

    // Each placement's cells spell its word in the grid.
    for (const p of solution) {
      expect(metadata.words).toContain(p.word)
      const cells = placementCells(p)
      expect(cells.length).toBe(p.word.length)
      cells.forEach(([r, c], i) => {
        expect(metadata.grid[r][c]).toBe(p.word[i])
      })
    }
  })

  it('only uses the allowed directions', () => {
    const { solution } = generateWordSearch(WORDS, { size: 10, seed: 5, targetWords: 6, directions: ['E', 'S'] })!
    for (const p of solution) expect(['E', 'S']).toContain(p.direction)
  })

  it('is deterministic for a given seed', () => {
    const a = generateWordSearch(WORDS, { size: 12, seed: 7, targetWords: 8, directions: ['E', 'S', 'SE', 'NE'] })
    const b = generateWordSearch(WORDS, { size: 12, seed: 7, targetWords: 8, directions: ['E', 'S', 'SE', 'NE'] })
    expect(JSON.stringify(a?.metadata.grid)).toBe(JSON.stringify(b?.metadata.grid))
    expect(JSON.stringify(a?.solution)).toBe(JSON.stringify(b?.solution))
  })
})

describe('buildWordSearchPuzzle', () => {
  it('builds a themed puzzle for every theme + difficulty with the right directions', () => {
    for (const theme of WORD_SEARCH_THEMES) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        const { metadata, solution } = buildWordSearchPuzzle(theme.id, difficulty, 1234)
        expect(metadata.words.length).toBeGreaterThanOrEqual(4)
        expect(metadata.theme).toBe(theme.id)
        expect(metadata.difficulty).toBe(difficulty)
        // easy = horizontal/vertical only.
        if (difficulty === 'easy') for (const p of solution) expect(['E', 'S']).toContain(p.direction)
      }
    }
  })
})

// ── Selection geometry ─────────────────────────────────────────────────────────

describe('selection helpers', () => {
  it('walks straight lines and rejects crooked ones', () => {
    expect(selectionCells([0, 0], [0, 3])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ])
    expect(selectionCells([0, 0], [3, 3])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    expect(selectionCells([0, 0], [2, 3])).toBeNull()
  })

  it('matches a drag to a planted word in either direction', () => {
    const placement = { word: 'TIGER', row: 2, col: 1, direction: 'E' as const }
    const end = placementEnd(placement)
    expect(matchSelectionToPlacement([placement], [2, 1], end)?.word).toBe('TIGER')
    // reversed drag
    expect(matchSelectionToPlacement([placement], end, [2, 1])?.word).toBe('TIGER')
    // wrong endpoints
    expect(matchSelectionToPlacement([placement], [2, 1], [2, 2])).toBeNull()
  })
})

// ── Scoring ──────────────────────────────────────────────────────────────────

const META: WordSearchMetadata = {
  size: 8,
  grid: Array.from({ length: 8 }, () => Array(8).fill('A')),
  words: ['TIGER', 'PANDA'],
  directions: ['E', 'S'],
  difficulty: 'medium', // length bonus OFF
}

function found(overrides: Partial<WordSearchFound>): WordSearchFound {
  return {
    id: Math.random().toString(36),
    game_id: 'G',
    round_id: 'R',
    player_id: 'p1',
    word: 'TIGER',
    start_row: 0,
    start_col: 0,
    end_row: 0,
    end_col: 4,
    via_hint: false,
    found_at: '2026-07-12T00:00:00.000Z',
    ...overrides,
  }
}

const PLAYERS = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Ben' },
]

describe('tallyWordSearchScores', () => {
  it('awards word points + a first-finder bonus', () => {
    const rows = [
      found({ player_id: 'p1', word: 'TIGER', found_at: '2026-07-12T00:00:01.000Z' }),
      found({ player_id: 'p2', word: 'TIGER', found_at: '2026-07-12T00:00:05.000Z' }),
    ]
    const scores = tallyWordSearchScores(META, rows, PLAYERS)
    const p1 = scores.find((s) => s.player_id === 'p1')!
    const p2 = scores.find((s) => s.player_id === 'p2')!
    expect(p1.points).toBe(WORD_SEARCH_WORD_POINTS + WORD_SEARCH_FIRST_BONUS)
    expect(p2.points).toBe(WORD_SEARCH_WORD_POINTS)
    expect(p1.wordsFound).toBe(1)
  })

  it('applies the hint penalty and denies the speed bonus for a revealed word', () => {
    const rows = [found({ player_id: 'p1', word: 'TIGER', via_hint: true })]
    const scores = tallyWordSearchScores(META, rows, PLAYERS)
    const p1 = scores.find((s) => s.player_id === 'p1')!
    // Revealed word: word points minus the hint penalty, but NO first-finder bonus.
    expect(p1.points).toBe(WORD_SEARCH_WORD_POINTS + WORD_SEARCH_HINT_PENALTY)
  })

  it('adds a per-letter length bonus on Hard only', () => {
    const rows = [found({ player_id: 'p1', word: 'TIGER' })]
    const easy = tallyWordSearchScores({ ...META, difficulty: 'easy' }, rows, PLAYERS)
    const hard = tallyWordSearchScores({ ...META, difficulty: 'hard' }, rows, PLAYERS)
    const easyP1 = easy.find((s) => s.player_id === 'p1')!
    const hardP1 = hard.find((s) => s.player_id === 'p1')!
    expect(easyP1.points).toBe(WORD_SEARCH_WORD_POINTS + WORD_SEARCH_FIRST_BONUS)
    // TIGER = 5 letters → +5 length bonus on hard.
    expect(hardP1.points).toBe(WORD_SEARCH_WORD_POINTS + WORD_SEARCH_FIRST_BONUS + 5 * WORD_SEARCH_LENGTH_BONUS)
  })
})

describe('completion helpers', () => {
  it('tracks per-player completion and win condition', () => {
    const partial = [found({ player_id: 'p1', word: 'TIGER' })]
    expect(wordSearchCompletionPercent(META, partial, 'p1')).toBe(50)
    expect(isWordSearchCompleteForPlayer(META, partial, 'p1')).toBe(false)

    const full = [found({ player_id: 'p1', word: 'TIGER' }), found({ player_id: 'p1', word: 'PANDA' })]
    expect(wordSearchCompletionPercent(META, full, 'p1')).toBe(100)
    expect(isWordSearchCompleteForPlayer(META, full, 'p1')).toBe(true)
  })
})

describe('parseWordSearchMetadata', () => {
  it('accepts valid metadata and rejects junk', () => {
    expect(parseWordSearchMetadata(META)).not.toBeNull()
    expect(parseWordSearchMetadata(null)).toBeNull()
    expect(parseWordSearchMetadata({ size: 8 })).toBeNull()
  })
})
