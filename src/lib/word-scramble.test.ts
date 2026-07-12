import { describe, it, expect } from 'vitest'
import {
  scrambleWord,
  guessMatchesAnswer,
  xorshift,
  tallyWordScrambleScores,
  wordScrambleCompletionPercent,
  playerCurrentIndex,
  WORD_SCRAMBLE_WORD_POINTS,
  WORD_SCRAMBLE_FIRST_BONUS,
  WORD_SCRAMBLE_HINT_PENALTY,
  WORD_SCRAMBLE_CLUE_PENALTY,
  WORD_SCRAMBLE_LENGTH_BONUS,
  type WordScrambleMetadata,
  type WordScrambleSolve,
} from '@/lib/word-scramble'
import { buildWordScramblePuzzle } from '@/lib/word-scramble-puzzles'

describe('scrambleWord', () => {
  it('rearranges the letters into a different order but keeps the same multiset', () => {
    const rng = xorshift(12345)
    const scrambled = scrambleWord('PLANET', rng)
    expect(scrambled).not.toBe('PLANET')
    expect(scrambled.split('').sort().join('')).toBe('PLANET'.split('').sort().join(''))
  })

  it('is deterministic for a given seed', () => {
    expect(scrambleWord('VOLCANO', xorshift(7))).toBe(scrambleWord('VOLCANO', xorshift(7)))
  })
})

describe('guessMatchesAnswer', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(guessMatchesAnswer('  pla-net ', 'PLANET')).toBe(true)
    expect(guessMatchesAnswer('planets', 'PLANET')).toBe(false)
  })
})

describe('buildWordScramblePuzzle', () => {
  it('builds a scrambled puzzle whose answers unscramble to real bank words', () => {
    const { metadata, solution } = buildWordScramblePuzzle('animals', 'medium', 999)
    expect(metadata.scrambles.length).toBe(solution.length)
    expect(metadata.count).toBe(solution.length)
    for (let i = 0; i < solution.length; i += 1) {
      // Each scramble is an anagram of its answer.
      expect(metadata.scrambles[i].split('').sort().join('')).toBe(solution[i].split('').sort().join(''))
    }
  })

  it('is deterministic for a given seed', () => {
    const a = buildWordScramblePuzzle('food', 'easy', 42)
    const b = buildWordScramblePuzzle('food', 'easy', 42)
    expect(a.solution).toEqual(b.solution)
    expect(a.metadata.scrambles).toEqual(b.metadata.scrambles)
  })

  it('carries a clue for every platform word (for the Hint button)', () => {
    const { metadata, solution } = buildWordScramblePuzzle('general', 'medium', 7)
    expect(metadata.hints?.length).toBe(solution.length)
    expect(metadata.hints?.every((h) => h.trim().length > 0)).toBe(true)
  })
})

const META: WordScrambleMetadata = { scrambles: ['XXX', 'YYY'], count: 2, difficulty: 'medium' }
const PLAYERS = [
  { id: 'p1', name: 'Ana' },
  { id: 'p2', name: 'Ben' },
]

function solve(overrides: Partial<WordScrambleSolve>): WordScrambleSolve {
  return {
    id: Math.random().toString(36),
    game_id: 'G',
    round_id: 'R',
    player_id: 'p1',
    scramble_index: 0,
    word: 'TIGER',
    via_hint: false,
    solved_at: '2026-07-12T00:00:00.000Z',
    ...overrides,
  }
}

describe('tallyWordScrambleScores', () => {
  it('awards word points + a first-solver bonus', () => {
    const rows = [
      solve({ player_id: 'p1', scramble_index: 0, solved_at: '2026-07-12T00:00:01.000Z' }),
      solve({ player_id: 'p2', scramble_index: 0, solved_at: '2026-07-12T00:00:05.000Z' }),
    ]
    const scores = tallyWordScrambleScores(META, rows, PLAYERS)
    const p1 = scores.find((s) => s.player_id === 'p1')!
    const p2 = scores.find((s) => s.player_id === 'p2')!
    expect(p1.points).toBe(WORD_SCRAMBLE_WORD_POINTS + WORD_SCRAMBLE_FIRST_BONUS)
    expect(p2.points).toBe(WORD_SCRAMBLE_WORD_POINTS)
    expect(p1.solved).toBe(1)
  })

  it('applies the hint penalty and denies the first-solver bonus for a hinted solve', () => {
    const rows = [solve({ player_id: 'p1', scramble_index: 0, via_hint: true })]
    const scores = tallyWordScrambleScores(META, rows, PLAYERS)
    const p1 = scores.find((s) => s.player_id === 'p1')!
    expect(p1.points).toBe(WORD_SCRAMBLE_WORD_POINTS + WORD_SCRAMBLE_HINT_PENALTY)
  })

  it('subtracts the clue-hint penalty for each word where a clue was spent', () => {
    const rows = [solve({ player_id: 'p1', scramble_index: 0, solved_at: '2026-07-12T00:00:01.000Z' })]
    const scores = tallyWordScrambleScores(META, rows, PLAYERS, {
      hints: [{ player_id: 'p1', scramble_index: 0, letters: 1 }],
    })
    const p1 = scores.find((s) => s.player_id === 'p1')!
    // 10 base + 5 first bonus + 1 clue × (−1) = 14
    expect(p1.points).toBe(WORD_SCRAMBLE_WORD_POINTS + WORD_SCRAMBLE_FIRST_BONUS + WORD_SCRAMBLE_CLUE_PENALTY)
  })

  it('adds a per-letter length bonus on Hard only', () => {
    const rows = [solve({ player_id: 'p1', scramble_index: 0, word: 'TIGER' })]
    const easy = tallyWordScrambleScores({ ...META, difficulty: 'easy' }, rows, PLAYERS)
    const hard = tallyWordScrambleScores({ ...META, difficulty: 'hard' }, rows, PLAYERS)
    expect(easy.find((s) => s.player_id === 'p1')!.points).toBe(WORD_SCRAMBLE_WORD_POINTS + WORD_SCRAMBLE_FIRST_BONUS)
    expect(hard.find((s) => s.player_id === 'p1')!.points).toBe(
      WORD_SCRAMBLE_WORD_POINTS + WORD_SCRAMBLE_FIRST_BONUS + 5 * WORD_SCRAMBLE_LENGTH_BONUS
    )
  })

  it('breaks a score tie by finish time — the faster solver ranks higher', () => {
    const rows = [
      solve({ player_id: 'p1', scramble_index: 0, solved_at: '2026-07-12T00:00:01.000Z' }),
      solve({ player_id: 'p2', scramble_index: 1, solved_at: '2026-07-12T00:00:02.000Z' }),
      solve({ player_id: 'p2', scramble_index: 0, solved_at: '2026-07-12T00:00:05.000Z' }),
      solve({ player_id: 'p1', scramble_index: 1, solved_at: '2026-07-12T00:00:06.000Z' }),
    ]
    const scores = tallyWordScrambleScores(META, rows, PLAYERS)
    expect(scores[0].points).toBe(scores[1].points)
    expect(scores[0].player_id).toBe('p2')
  })
})

describe('progress helpers', () => {
  it('tracks completion percent and the current unsolved index', () => {
    const rows = [solve({ player_id: 'p1', scramble_index: 0 })]
    expect(wordScrambleCompletionPercent(META, rows, 'p1')).toBe(50)
    expect(playerCurrentIndex(META, rows, 'p1')).toBe(1)
    expect(wordScrambleCompletionPercent(META, rows, 'p2')).toBe(0)
    expect(playerCurrentIndex(META, rows, 'p2')).toBe(0)
  })
})
