// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { DailyChessMatePlay } from './DailyChessMatePlay'
import { DailySudokuPlay } from './DailySudokuPlay'
import { DailyTriviaPlay } from './DailyTriviaPlay'
import { DailyWordGroupingPlay } from './DailyWordGroupingPlay'
import { DailyWordScramblePlay } from './DailyWordScramblePlay'
import { DailyWordSearchPlay } from './DailyWordSearchPlay'
import { hashWord } from '@/lib/daily-word-hash'

// The submit path is what's under test; the boards and the confirm dialog are not.
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => ({ confirm: async () => true }) }))
vi.mock('@/components/sudoku/SudokuBoard', () => ({ SudokuBoard: () => null }))
vi.mock('@/components/word-search/WordSearchBoard', () => ({ WordSearchBoard: () => null }))

const CHALLENGE_ID = 'challenge-1'

/** Persist a daily attempt the way `daily-progress` would, started `agoMs` ago. */
function saveProgress(answers: unknown, agoMs: number) {
  window.localStorage.setItem(
    `daily-progress:${CHALLENGE_ID}`,
    JSON.stringify({ startedAt: Date.now() - agoMs, answers })
  )
}

/** Mount, let every reveal delay and auto-submit settle, and report the submitted timeSeconds. */
async function submittedTime(element: React.ReactElement, onSubmit: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers()
  render(element)
  await act(async () => {
    vi.advanceTimersByTime(5000)
  })
  expect(onSubmit).toHaveBeenCalledTimes(1)
  return onSubmit.mock.calls[0][0].timeSeconds as number
}

/**
 * Assert a real elapsed time of about `seconds`, not a zero.
 *
 * A window rather than an equality: each component holds its own reveal delay before submitting
 * (1200ms in chess mate, 2800ms in word grouping, none in the rest) and the fake clock advances
 * across it, so the exact figure depends on when the submit path samples the time. The point of
 * these tests is that the time is real, so they do not pin that down.
 */
function expectRealElapsed(time: number, seconds: number) {
  expect(time).toBeGreaterThanOrEqual(seconds)
  expect(time).toBeLessThan(seconds + 10)
}

/** A full, valid 9x9 grid (each row is the base row rotated), so the board reads as solved. */
function solvedSudokuGrid(): number[][] {
  return Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => (((r % 3) * 3 + Math.floor(r / 3) + c) % 9) + 1)
  )
}

const CHESS_PUZZLE = { fen: '8/8/8/8/8/8/8/K6k', toMove: 'white', mateIn: 1, solutionLines: [['Qh5+', 'Kg8']] }

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * A submit that fails (or whose response is dropped) deliberately keeps localStorage so a reload
 * can retry — see `useDailyChallengeSession`. That reload remounts the board in its FINISHED
 * state, so the completion auto-submit fires on the first commit, before the timer has ticked.
 *
 * `elapsedSinceStart` is unit-tested in `src/lib/daily-progress.test.ts`; these assert each
 * component actually submits through it on that path, which is where reading the timer hook's
 * `elapsed` state reported a zero — a full speed bonus in `computeNormalizedScore` plus an
 * unbeatable 0-second row on a time-ranked leaderboard.
 */
describe('retry on a restored complete board reports the real elapsed time', () => {
  it('chess mate — clock stopped by status: solved', async () => {
    saveProgress({ moves: ['Qh5+', 'Kg8'], wrongAttempts: 1, status: 'solved' }, 300_000)
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyChessMatePlay challengeId={CHALLENGE_ID} puzzle={CHESS_PUZZLE} timer={600} onSubmit={onSubmit} />,
      onSubmit
    )
    expectRealElapsed(time, 300)
    // The wrong-attempt count has to survive the same path — it is a 150-point penalty each.
    expect(onSubmit.mock.calls[0][0].submission.wrongAttempts).toBe(1)
  })

  it('word grouping — clock stopped by all four groups revealed', async () => {
    const groups = [1, 2, 3, 4].map((difficulty) => ({
      category: `category-${difficulty}`,
      words: ['a', 'b', 'c', 'd'].map((w) => `w${difficulty}${w}`),
      difficulty,
    }))
    saveProgress({ guesses: [{ words: ['w1a'] }], revealedGroups: groups, mistakes: 1 }, 200_000)
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyWordGroupingPlay
        challengeId={CHALLENGE_ID}
        puzzle={{ words: groups.flatMap((g) => g.words), groups }}
        timer={600}
        onSubmit={onSubmit}
      />,
      onSubmit
    )
    expectRealElapsed(time, 200)
  })

  it('word search — clock running, submits on the first commit', async () => {
    const words = ['AB', 'CD']
    saveProgress(
      {
        foundWords: words,
        myFoundCells: [
          [false, false],
          [false, false],
        ],
      },
      150_000
    )
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyWordSearchPlay
        challengeId={CHALLENGE_ID}
        puzzle={{
          metadata: {
            size: 2,
            words,
            grid: [
              ['A', 'B'],
              ['C', 'D'],
            ],
          },
        }}
        timer={600}
        onSubmit={onSubmit}
      />,
      onSubmit
    )
    expectRealElapsed(time, 150)
  })

  it('trivia — every question answered', async () => {
    saveProgress(
      [
        { questionIndex: 0, choiceIndex: 1 },
        { questionIndex: 1, choiceIndex: 0 },
      ],
      90_000
    )
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyTriviaPlay
        challengeId={CHALLENGE_ID}
        puzzle={{
          questions: [
            { question: 'q1', choices: ['a', 'b'] },
            { question: 'q2', choices: ['a', 'b'] },
          ],
        }}
        timer={600}
        onSubmit={onSubmit}
      />,
      onSubmit
    )
    expectRealElapsed(time, 90)
  })

  it('word scramble — every word solved', async () => {
    saveProgress(
      {
        solved: [
          { index: 0, word: 'CAT' },
          { index: 1, word: 'DOG' },
        ],
        skipped: [],
        currentIndex: 1,
        hintedIndices: [],
      },
      100_000
    )
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyWordScramblePlay
        challengeId={CHALLENGE_ID}
        puzzle={{
          metadata: { scrambles: ['TAC', 'GOD'], hints: ['h1', 'h2'] },
          answer_hashes: ['CAT', 'DOG'].map(hashWord),
        }}
        timer={600}
        onSubmit={onSubmit}
      />,
      onSubmit
    )
    expectRealElapsed(time, 100)
  })

  it('sudoku — every cell filled correctly', async () => {
    const solved = solvedSudokuGrid()
    saveProgress(solved, 250_000)
    const onSubmit = vi.fn()
    const puzzle = solved.map((row, r) => row.map((v, c) => (r === 0 && c < 3 ? 0 : v)))
    const time = await submittedTime(
      <DailySudokuPlay challengeId={CHALLENGE_ID} puzzle={puzzle} timer={600} onSubmit={onSubmit} />,
      onSubmit
    )
    expectRealElapsed(time, 250)
  })
})

/**
 * The two components that hold a finished board on screen before submitting record the moment
 * they finished. That moment is persisted, so a submit that fails and is retried from a later
 * reload still reports the solve time — not the time the player happened to come back.
 */
describe('a persisted completion time survives the reload that retries the submit', () => {
  it('chess mate — reports the solve time, not the reload', async () => {
    const startedAgoMs = 600_000
    saveProgress(
      {
        moves: ['Qh5+', 'Kg8'],
        wrongAttempts: 0,
        status: 'solved',
        finishedAtMs: Date.now() - startedAgoMs + 120_000,
      },
      startedAgoMs
    )
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyChessMatePlay challengeId={CHALLENGE_ID} puzzle={CHESS_PUZZLE} timer={900} onSubmit={onSubmit} />,
      onSubmit
    )
    expect(time).toBe(120)
  })

  it('word grouping — reports the solve time, not the reload', async () => {
    const groups = [1, 2, 3, 4].map((difficulty) => ({
      category: `category-${difficulty}`,
      words: ['a', 'b', 'c', 'd'].map((w) => `w${difficulty}${w}`),
      difficulty,
    }))
    const startedAgoMs = 600_000
    saveProgress(
      {
        guesses: [{ words: ['w1a'] }],
        revealedGroups: groups,
        mistakes: 0,
        finishedAtMs: Date.now() - startedAgoMs + 90_000,
      },
      startedAgoMs
    )
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyWordGroupingPlay
        challengeId={CHALLENGE_ID}
        puzzle={{ words: groups.flatMap((g) => g.words), groups }}
        timer={900}
        onSubmit={onSubmit}
      />,
      onSubmit
    )
    expect(time).toBe(90)
  })
})

describe('the submitted time does not leak past the timer or into fresh attempts', () => {
  it('an expired unfinished board reports the timer length, not the wall clock', async () => {
    // 900s of wall clock against a 300s challenge: the clamp has to hold on the retry path too.
    saveProgress({ moves: [], wrongAttempts: 2, status: 'playing' }, 900_000)
    const onSubmit = vi.fn()
    const time = await submittedTime(
      <DailyChessMatePlay challengeId={CHALLENGE_ID} puzzle={CHESS_PUZZLE} timer={300} onSubmit={onSubmit} />,
      onSubmit
    )
    expect(time).toBe(300)
  })

  it('a first visit is not auto-submitted', async () => {
    const onSubmit = vi.fn()
    vi.useFakeTimers()
    render(
      <DailyTriviaPlay
        challengeId={CHALLENGE_ID}
        puzzle={{ questions: [{ question: 'q1', choices: ['a', 'b'] }] }}
        timer={600}
        onSubmit={onSubmit}
      />
    )
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
