// Server-only daily-challenge puzzle generation.
//
// This lives apart from `daily-challenge.ts` because it (transitively, via word-hunt-dictionary)
// imports Node's `fs`. `daily-challenge.ts` is imported by client components (DailyChallengeSection),
// so keeping this dispatch there pulled `fs` into the browser bundle and failed the build
// ("Module not found: Can't resolve 'fs'"). Only server routes import this file.

import { DAILY_GAME_TIMER, type DailyChallengeGameType } from '@/lib/daily-challenge'

// Calls the existing seeded generators. Server-only (word-hunt uses fs for its dictionary).
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
