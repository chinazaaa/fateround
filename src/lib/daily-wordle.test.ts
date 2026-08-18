import { describe, it, expect } from 'vitest'
import {
  buildWordlePuzzle,
  gradeWordleGuess,
  wordleKeyBestStates,
  wordleMaxAttempts,
  wordleBasePoints,
  wordleFinalScore,
  wordleEmojiGrid,
  WORDLE_PERFECT_BONUS,
} from './daily-wordle'
import { WORDLE_GENERAL_ENGLISH } from '@/data/daily-banks/wordle-general-english'
import { WORDLE_NAIJA_SLANG } from '@/data/daily-banks/wordle-naija-slang'

describe('word banks', () => {
  it('general English words are all exactly 5 letters, uppercase, unique', () => {
    expect(WORDLE_GENERAL_ENGLISH.length).toBeGreaterThan(500)
    for (const w of WORDLE_GENERAL_ENGLISH) {
      expect(w).toMatch(/^[A-Z]{5}$/)
    }
    expect(new Set(WORDLE_GENERAL_ENGLISH).size).toBe(WORDLE_GENERAL_ENGLISH.length)
  })

  it('naija slang entries are 3–7 letters, have a hint, and are unique', () => {
    expect(WORDLE_NAIJA_SLANG.length).toBeGreaterThan(30)
    for (const e of WORDLE_NAIJA_SLANG) {
      expect(e.word).toMatch(/^[A-Z]{3,7}$/)
      expect(e.hint.trim()).not.toBe('')
    }
    expect(new Set(WORDLE_NAIJA_SLANG.map((e) => e.word)).size).toBe(WORDLE_NAIJA_SLANG.length)
  })
})

describe('attempts', () => {
  it('scales with word length: 5 → 6, 3 → 4, 7 → 8', () => {
    expect(wordleMaxAttempts(5)).toBe(6)
    expect(wordleMaxAttempts(3)).toBe(4)
    expect(wordleMaxAttempts(7)).toBe(8)
  })
})

describe('gradeWordleGuess', () => {
  it('grades a full match all-correct', () => {
    expect(gradeWordleGuess('ARRAY', 'array')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct'])
  })

  it('handles duplicate letters correctly (extra letters grade absent)', () => {
    // Target ABBEY has two Bs; guessing three Bs marks only two (one present + one correct).
    expect(gradeWordleGuess('BEBBY', 'ABBEY')).toEqual(['present', 'present', 'correct', 'absent', 'correct'])
  })

  it('one present mark per letter instance, not one per guess letter', () => {
    // Target has a single A; guessing two As marks only one present.
    const states = gradeWordleGuess('ALARM', 'BRAVO')
    expect(states.filter((s) => s === 'present')).toHaveLength(1)
  })

  it('correct letters are not double-counted as present', () => {
    expect(gradeWordleGuess('LEVEL', 'LEVER')).toEqual(['correct', 'correct', 'correct', 'correct', 'absent'])
  })

  it('ignores case and surrounding whitespace', () => {
    expect(gradeWordleGuess('  apple ', 'APPLE')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct'])
  })
})

describe('wordleKeyBestStates', () => {
  it('upgrades absent → present → correct, never downgrades', () => {
    const target = 'CRANE'
    const best = wordleKeyBestStates(['STONE', 'RAISE', 'CRANE'], target)
    expect(best.get('c')).toBe('correct')
    expect(best.get('r')).toBe('correct')
    expect(best.get('a')).toBe('correct')
    expect(best.get('n')).toBe('correct')
    expect(best.get('e')).toBe('correct')
    expect(best.get('s')).toBe('absent')
  })
})

describe('scoring', () => {
  it('pays a flat ladder regardless of attempt count', () => {
    expect(wordleBasePoints(1, 6)).toBe(1000)
    expect(wordleBasePoints(2, 6)).toBe(880)
    expect(wordleBasePoints(3, 6)).toBe(760)
    expect(wordleBasePoints(4, 6)).toBe(640)
    expect(wordleBasePoints(5, 6)).toBe(520)
    expect(wordleBasePoints(6, 6)).toBe(400)
  })

  it('scales the same ladder for a 4-attempt game', () => {
    expect(wordleBasePoints(1, 4)).toBe(1000)
    expect(wordleBasePoints(2, 4)).toBe(800)
    expect(wordleBasePoints(3, 4)).toBe(600)
    expect(wordleBasePoints(4, 4)).toBe(400)
  })

  it('adds the perfect bonus only on a guess-1 win', () => {
    expect(wordleFinalScore(1, 6, true)).toBe(1000 + WORDLE_PERFECT_BONUS)
    expect(wordleFinalScore(2, 6, true)).toBe(880)
  })

  it('a loss is always 0', () => {
    expect(wordleFinalScore(6, 6, false)).toBe(0)
    expect(wordleFinalScore(3, 6, false)).toBe(0)
  })
})

describe('wordleEmojiGrid', () => {
  it('renders a spoiler-free emoji board', () => {
    const grid = wordleEmojiGrid(['STONE', 'CRANE'], 'CRANE')
    expect(grid).toBe('⬛⬛⬛🟩🟩\n🟩🟩🟩🟩🟩')
  })
})

describe('buildWordlePuzzle', () => {
  it('is deterministic per seed and yields a valid puzzle', () => {
    const a = buildWordlePuzzle(42)
    const b = buildWordlePuzzle(42)
    expect(a).toEqual(b)
  })

  it('words and attempts are consistent', () => {
    const seeds = Array.from({ length: 80 }, (_, i) => i)
    for (const seed of seeds) {
      const p = buildWordlePuzzle(seed)
      expect(p.word).toMatch(/^[a-z]{3,7}$/)
      expect(p.length).toBe(p.word.length)
      expect(p.maxAttempts).toBe(p.word.length + 1)
      if (p.category === 'general_english') {
        expect(p.word).toHaveLength(5)
      }
    }
  })

  it('picks across both categories and multiple words over time', () => {
    const seeds = Array.from({ length: 80 }, (_, i) => i)
    const categories = new Set(seeds.map((s) => buildWordlePuzzle(s).category))
    const words = new Set(seeds.map((s) => buildWordlePuzzle(s).word))
    expect(categories.size).toBeGreaterThan(1)
    expect(words.size).toBeGreaterThan(10)
  })
})
