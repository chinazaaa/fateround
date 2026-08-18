import { describe, it, expect } from 'vitest'
import {
  buildWordleRoomSequence,
  clampWordleRoomCategory,
  clampWordleRoomTimer,
  clampWordleRoomWordCount,
  evaluateWordleRoomGuess,
  rankWordleRoomStandings,
  tallyWordleRoomScores,
  validateWordleRoomGuess,
  wordleRoomCategoryLabel,
  wordleRoomMaxAttemptsForWord,
  wordleRoomTotalScore,
  wordleRoomWordScore,
  WORDLE_ROOM_WORD_COUNT_OPTIONS,
  WORDLE_ROOM_DEFAULT_WORD_COUNT,
  WORDLE_ROOM_MIN_GUESS_INTERVAL_MS,
} from './wordle-room'
import { WORDLE_GENERAL_ENGLISH } from '@/data/daily-banks/wordle-general-english'

describe('wordle room sequence', () => {
  it('is deterministic per (seed, category) and independent across seeds', () => {
    const a = buildWordleRoomSequence(42, 'general_english', 5)
    const b = buildWordleRoomSequence(42, 'general_english', 5)
    expect(a).toEqual(b)
    const c = buildWordleRoomSequence(43, 'general_english', 5)
    expect(c).not.toEqual(a)
  })

  it('does not just take the first N bank words (it really shuffles)', () => {
    const seq = buildWordleRoomSequence(1, 'general_english', 5).map((e) => e.word)
    const naive = WORDLE_GENERAL_ENGLISH.slice(0, 5).map((w) => w.toLowerCase())
    expect(seq).not.toEqual(naive)
  })

  it('returns the requested count of unique, normalized lowercase words', () => {
    for (const count of WORDLE_ROOM_WORD_COUNT_OPTIONS) {
      const seq = buildWordleRoomSequence(7, 'general_english', count)
      const words = seq.map((e) => e.word)
      expect(words).toHaveLength(count)
      expect(new Set(words).size).toBe(count)
      for (const w of words) {
        expect(w).toMatch(/^[a-z]{5}$/)
      }
    }
  })

  it('supports the naija slang bank (3–7 letters)', () => {
    const seq = buildWordleRoomSequence(99, 'naija_slang', 20)
    const words = seq.map((e) => e.word)
    expect(words).toHaveLength(20)
    expect(new Set(words).size).toBe(20)
    for (const w of words) {
      expect(w).toMatch(/^[a-z]{3,7}$/)
    }
  })

  it('clamps category and word count', () => {
    expect(clampWordleRoomCategory('naija_slang')).toBe('naija_slang')
    expect(clampWordleRoomCategory('bogus')).toBe('general_english')
    expect(clampWordleRoomWordCount(10)).toBe(10)
    expect(clampWordleRoomWordCount(12)).toBe(WORDLE_ROOM_DEFAULT_WORD_COUNT)
    expect(clampWordleRoomTimer(300)).toBe(300)
    expect(clampWordleRoomTimer(0)).toBe(0)
    expect(clampWordleRoomTimer(77)).toBe(0)
  })

  it('labels categories', () => {
    expect(wordleRoomCategoryLabel('general_english')).toBe('General English')
    expect(wordleRoomCategoryLabel('naija_slang')).toBe('Naija Slang')
  })
})

describe('wordle room guess validation', () => {
  it('accepts a right-length guess and grades it', () => {
    const r = validateWordleRoomGuess('CRANE', 'crane')
    expect(r).toMatchObject({ ok: true, normalized: 'crane' })
    if (r.ok) {
      expect(r.states.every((s) => s === 'correct')).toBe(true)
    }
  })

  it('rejects wrong lengths and non-strings', () => {
    expect(validateWordleRoomGuess('CRANEZ', 'crane').ok).toBe(false)
    expect(validateWordleRoomGuess(42, 'crane').ok).toBe(false)
  })
})

describe('wordle room progression', () => {
  it('solves a word on the first guess and advances', () => {
    const r = evaluateWordleRoomGuess(0, 0, true, 6, 5)
    expect(r).toMatchObject({ solved: true, guessesUsed: 1, nextWordIndex: 1, wordsSolvedDelta: 1, finished: false })
    expect(r.pointsAwarded).toBe(1000 + 200)
  })

  it('a loss on the last attempt advances to the next word with 0 points', () => {
    const r = evaluateWordleRoomGuess(1, 5, false, 6, 5)
    expect(r).toMatchObject({ solved: false, guessesUsed: 6, pointsAwarded: 0, nextWordIndex: 2, finished: false })
  })

  it('an unsolved word never advances', () => {
    const r = evaluateWordleRoomGuess(0, 2, false, 6, 5)
    expect(r).toMatchObject({ nextWordIndex: 0, wordsSolvedDelta: 0, finished: false })
  })

  it('finishes after the last word is solved', () => {
    const r = evaluateWordleRoomGuess(4, 3, true, 6, 5)
    expect(r).toMatchObject({ nextWordIndex: 5, wordsSolvedDelta: 1, finished: true })
  })

  it('finishes after losing the last word', () => {
    const r = evaluateWordleRoomGuess(4, 5, false, 6, 5)
    expect(r).toMatchObject({ nextWordIndex: 5, finished: true })
  })

  it('scores per-word with base ladder + perfect bonus only on guess 1', () => {
    expect(wordleRoomWordScore(1, 6, true)).toBe(1200)
    expect(wordleRoomWordScore(2, 6, true)).toBe(880)
    expect(wordleRoomWordScore(6, 6, true)).toBe(400)
    expect(wordleRoomWordScore(3, 6, false)).toBe(0)
  })

  it('sums per-word scores into a total', () => {
    expect(wordleRoomTotalScore([{ points_awarded: 1200 }, { points_awarded: 880 }, { points_awarded: 0 }])).toBe(2080)
  })
})

describe('wordle room standings', () => {
  const base = {
    total_guesses: 0,
    total_time_ms: null,
    finished: false,
  }

  it('ranks by total points, then faster finish', () => {
    // Points-primary: more solves and fewer guesses per solve both raise your score, and a
    // hint deducts 300 from that word — so this single comparator captures the full spec.
    const rows = [
      // Fewer solves → strictly fewer points, ranks last.
      { ...base, player_id: 'a', words_solved: 3, total_points: 2000, total_time_ms: 60000, finished: true },
      { ...base, player_id: 'b', words_solved: 5, total_points: 3000, total_time_ms: 120000, finished: true },
      { ...base, player_id: 'c', words_solved: 5, total_points: 3000, total_time_ms: 90000, finished: true },
      { ...base, player_id: 'd', words_solved: 5, total_points: 3000, total_time_ms: 70000, finished: true },
    ]
    const ranked = rankWordleRoomStandings(rows).map((r) => r.player_id)
    expect(ranked).toEqual(['d', 'c', 'b', 'a'])
  })

  it('hint deduction: −300 from a solve, clamps at zero', () => {
    // Guess-1 with perfect bonus = 1200; with hint = 900.
    expect(wordleRoomWordScore(1, 6, true, true)).toBe(900)
    // Guess-6 with hint = 400 − 300 = 100.
    expect(wordleRoomWordScore(6, 6, true, true)).toBe(100)
    // Hypothetical low base (guess-6 on a 3-letter word: attempts=4, base=400) − 300 = 100.
    expect(wordleRoomWordScore(4, 4, true, true)).toBe(100)
    // A loss stays at 0 whether or not the hint was bought — no negative scores.
    expect(wordleRoomWordScore(6, 6, false, true)).toBe(0)
    // evaluateWordleRoomGuess forwards hintUsed through to wordleRoomWordScore.
    const r = evaluateWordleRoomGuess(0, 0, true, 6, 5, true)
    expect(r.pointsAwarded).toBe(900)
  })

  it('hint use costs points and moves you down the leaderboard', () => {
    // Both players solved the same words with the same guesses, but honest earns 3000; hint
    // user earns 3000 − 300 = 2700. Points-primary ranks honest first even though hint user
    // was faster.
    const rows = [
      { ...base, player_id: 'honest', words_solved: 5, total_points: 3000, total_time_ms: 100000, finished: true },
      { ...base, player_id: 'hinted', words_solved: 5, total_points: 2700, total_time_ms: 60000, finished: true },
    ]
    const ranked = rankWordleRoomStandings(rows).map((r) => r.player_id)
    expect(ranked).toEqual(['honest', 'hinted'])
  })

  it('unfinished players rank below finishers on equal points (timer cutoff)', () => {
    const rows = [
      { ...base, player_id: 'done', words_solved: 4, total_points: 2500, total_time_ms: 100000, finished: true },
      { ...base, player_id: 'cutoff', words_solved: 4, total_points: 2500, total_time_ms: null, finished: false },
    ]
    const ranked = rankWordleRoomStandings(rows).map((r) => r.player_id)
    expect(ranked).toEqual(['done', 'cutoff'])
  })

  it('tallyWordleScores filters spectators and exposes progress rows', () => {
    const progress = [
      {
        player_id: 'p1',
        word_index: 3,
        words_solved: 3,
        total_guesses: 15,
        total_points: 2000,
        total_time_ms: 50000,
        finished: false,
      },
      {
        player_id: 'p2',
        word_index: 5,
        words_solved: 5,
        total_guesses: 22,
        total_points: 3500,
        total_time_ms: 110000,
        finished: true,
      },
    ]
    const players = [
      { id: 'p1', name: 'A', spectator: false },
      { id: 'p2', name: 'B', spectator: false },
      { id: 'watcher', name: 'W', spectator: true },
    ]
    const ranked = tallyWordleRoomScores(progress, players)
    expect(ranked.map((r) => r.player_id)).toEqual(['p2', 'p1'])
    expect(ranked.map((r) => r.name)).toEqual(['B', 'A'])
    expect(ranked[0]).toMatchObject({ word_index: 5, words_solved: 5, finished: true })
  })
})

describe('wordle room constants', () => {
  it('supports 5/10/15/20 words and an 800ms guess floor', () => {
    expect(WORDLE_ROOM_WORD_COUNT_OPTIONS).toEqual([5, 10, 15, 20])
    expect(WORDLE_ROOM_MIN_GUESS_INTERVAL_MS).toBe(800)
  })

  it('max attempts scale with word length', () => {
    expect(wordleRoomMaxAttemptsForWord('crane')).toBe(6)
    expect(wordleRoomMaxAttemptsForWord('omo')).toBe(4)
  })

  it('the general English bank is large enough for 20 distinct words', () => {
    expect(WORDLE_GENERAL_ENGLISH.length).toBeGreaterThan(20)
  })
})
