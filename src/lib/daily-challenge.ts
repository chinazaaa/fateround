import { watToday } from '@/lib/community-dates'

// ---------------------------------------------------------------------------
// Game types eligible for the daily challenge
// ---------------------------------------------------------------------------

export const DAILY_CHALLENGE_GAME_TYPES = [
  'sudoku',
  'word_hunt',
  'crossword',
  'word_search',
  'word_scramble',
] as const

export type DailyChallengeGameType = (typeof DAILY_CHALLENGE_GAME_TYPES)[number]

export function isDailyChallengeGameType(value: string): value is DailyChallengeGameType {
  return (DAILY_CHALLENGE_GAME_TYPES as readonly string[]).includes(value)
}

export const DAILY_GAME_SLUG_TO_TYPE: Record<string, DailyChallengeGameType> = {
  sudoku: 'sudoku',
  'word-hunt': 'word_hunt',
  crossword: 'crossword',
  'word-search': 'word_search',
  'word-scramble': 'word_scramble',
}

export const DAILY_GAME_TYPE_TO_SLUG: Record<DailyChallengeGameType, string> = {
  sudoku: 'sudoku',
  word_hunt: 'word-hunt',
  crossword: 'crossword',
  word_search: 'word-search',
  word_scramble: 'word-scramble',
}

export const DAILY_GAME_LABELS: Record<DailyChallengeGameType, string> = {
  sudoku: 'Sudoku',
  word_hunt: 'Word Hunt',
  crossword: 'Crossword',
  word_search: 'Word Search',
  word_scramble: 'Word Scramble',
}

export const DAILY_GAME_EMOJIS: Record<DailyChallengeGameType, string> = {
  sudoku: '🔢',
  word_hunt: '🔤',
  crossword: '📝',
  word_search: '🔍',
  word_scramble: '🔀',
}

// Default timer per game (seconds). Time-first games get a countdown;
// score-first (word_hunt) also has a timer since it's a timed race.
export const DAILY_GAME_TIMER: Record<DailyChallengeGameType, number> = {
  sudoku: 900,
  word_hunt: 180,
  crossword: 600,
  word_search: 300,
  word_scramble: 300,
}

// Whether the primary metric is time (lower is better) or score (higher is better).
export const DAILY_GAME_PRIMARY_METRIC: Record<DailyChallengeGameType, 'time' | 'score'> = {
  sudoku: 'time',
  word_hunt: 'score',
  crossword: 'time',
  word_search: 'time',
  word_scramble: 'time',
}

// ---------------------------------------------------------------------------
// Deterministic seed from (gameType, date)
// ---------------------------------------------------------------------------

export function getDailyChallengeSeed(gameType: string, date: string): number {
  const input = `daily:${gameType}:${date}`
  let hash = 0x811c9dc5 // FNV-1a offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) // FNV prime
  }
  return hash >>> 0 // unsigned 32-bit
}

// ---------------------------------------------------------------------------
// Score normalization (0–1000)
// ---------------------------------------------------------------------------
// Formula: completion 70% + speed 20% - penalty 10%.

export interface DailyScoreInput {
  itemsSolved: number
  itemsTotal: number
  timeSeconds: number
  maxTimeSeconds: number
  hintsUsed: number
  maxHints: number
}

export function computeNormalizedScore(input: DailyScoreInput): number {
  const { itemsSolved, itemsTotal, timeSeconds, maxTimeSeconds, hintsUsed, maxHints } = input

  const completionRatio = itemsTotal > 0 ? itemsSolved / itemsTotal : 0
  const speedRatio =
    maxTimeSeconds > 0 ? Math.max(0, 1 - timeSeconds / maxTimeSeconds) : completionRatio > 0 ? 1 : 0
  const penaltyRatio = maxHints > 0 ? Math.min(1, hintsUsed / maxHints) : 0

  const raw = completionRatio * 700 + speedRatio * 200 - penaltyRatio * 100
  return Math.max(0, Math.min(1000, Math.round(raw)))
}

// ---------------------------------------------------------------------------
// Solution stripping — remove answer keys before sending to client
// ---------------------------------------------------------------------------

export function stripSolution(
  gameType: DailyChallengeGameType,
  puzzleData: Record<string, unknown>
): Record<string, unknown> {
  const safe = { ...puzzleData }
  delete safe.solution

  if (gameType === 'word_hunt') {
    delete safe.valid_words
  }

  return safe
}

// ---------------------------------------------------------------------------
// Puzzle generation dispatch
// ---------------------------------------------------------------------------
// Calls the existing seeded generators. Server-only (uses fs for word-hunt dictionary).

export async function generateDailyPuzzle(
  gameType: DailyChallengeGameType,
  seed: number
): Promise<{ puzzleData: Record<string, unknown>; config: Record<string, unknown> }> {
  switch (gameType) {
    case 'sudoku': {
      const { generateSudokuPuzzle } = await import('@/lib/sudoku')
      const { puzzle, solution } = generateSudokuPuzzle(seed)
      const emptyCells = puzzle.flat().filter((v) => v === 0).length
      return {
        puzzleData: { puzzle, solution },
        config: {
          timer: DAILY_GAME_TIMER.sudoku,
          emptyCells,
        },
      }
    }

    case 'word_hunt': {
      const { buildWordHuntMetadata } = await import('@/lib/word-hunt-dictionary')
      const metadata = buildWordHuntMetadata(seed)
      return {
        puzzleData: {
          grid: metadata.grid,
          valid_words: metadata.valid_words,
        },
        config: {
          timer: DAILY_GAME_TIMER.word_hunt,
          totalWords: metadata.valid_words?.length ?? 0,
        },
      }
    }

    case 'crossword': {
      const { buildCrosswordPuzzle } = await import('@/lib/crossword-puzzles')
      const result = buildCrosswordPuzzle('general', 'medium', seed)
      return {
        puzzleData: {
          metadata: result.metadata,
          solution: result.solution,
        },
        config: {
          timer: DAILY_GAME_TIMER.crossword,
          theme: 'general',
          difficulty: 'medium',
          totalClues: result.metadata.clues?.length ?? 0,
        },
      }
    }

    case 'word_search': {
      const { buildWordSearchPuzzle } = await import('@/lib/word-search-puzzles')
      const result = buildWordSearchPuzzle('general', 'medium', seed)
      return {
        puzzleData: {
          metadata: result.metadata,
          solution: result.solution,
        },
        config: {
          timer: DAILY_GAME_TIMER.word_search,
          theme: 'general',
          difficulty: 'medium',
          totalWords: result.metadata.words?.length ?? 0,
        },
      }
    }

    case 'word_scramble': {
      const { buildWordScramblePuzzle } = await import('@/lib/word-scramble-puzzles')
      const result = buildWordScramblePuzzle('general', 'medium', seed)
      return {
        puzzleData: {
          metadata: result.metadata,
          solution: result.solution,
        },
        config: {
          timer: DAILY_GAME_TIMER.word_scramble,
          theme: 'general',
          difficulty: 'medium',
          totalWords: result.solution?.length ?? 0,
        },
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Challenge number — days since launch (for display: "Daily Sudoku #42")
// ---------------------------------------------------------------------------

const DAILY_CHALLENGE_EPOCH = '2026-08-20'

export function getDailyChallengeNumber(dateStr: string): number {
  const epoch = new Date(`${DAILY_CHALLENGE_EPOCH}T00:00:00Z`).getTime()
  const current = new Date(`${dateStr}T00:00:00Z`).getTime()
  return Math.floor((current - epoch) / (24 * 60 * 60 * 1000)) + 1
}

// Re-export for convenience
export { watToday }
