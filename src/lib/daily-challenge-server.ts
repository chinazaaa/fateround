// Server-only daily-challenge puzzle generation.
//
// This lives apart from `daily-challenge.ts` because it (transitively, via word-hunt-dictionary)
// imports Node's `fs`. `daily-challenge.ts` is imported by client components (DailyChallengeSection),
// so keeping this dispatch there pulled `fs` into the browser bundle and failed the build
// ("Module not found: Can't resolve 'fs'"). Only server routes import this file.

import { DAILY_GAME_TIMER, type DailyChallengeGameType } from '@/lib/daily-challenge'

type PuzzleResult = { puzzleData: Record<string, unknown>; config: Record<string, unknown> }

// Calls the existing seeded generators. Server-only (word-hunt uses fs for its dictionary).
export async function generateDailyPuzzle(gameType: DailyChallengeGameType, seed: number): Promise<PuzzleResult> {
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
      const result = buildCrosswordPuzzle('general', 'hard', seed)
      return {
        puzzleData: {
          metadata: result.metadata,
          solution: result.solution,
        },
        config: {
          timer: DAILY_GAME_TIMER.crossword,
          theme: 'general',
          difficulty: 'hard',
          totalClues: result.metadata.clues?.length ?? 0,
        },
      }
    }

    case 'mini_crossword': {
      const { buildCrosswordPuzzle } = await import('@/lib/crossword-puzzles')
      const result = buildCrosswordPuzzle('general', 'easy', seed)
      return {
        puzzleData: {
          metadata: result.metadata,
          solution: result.solution,
        },
        config: {
          timer: DAILY_GAME_TIMER.mini_crossword,
          theme: 'general',
          difficulty: 'easy',
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

    case 'trivia':
      throw new Error('Daily trivia requires admin content — no algorithmic fallback')

    case 'whot_puzzle': {
      const { generateWhotPuzzle } = await import('@/lib/daily-whot-puzzle')
      return generateWhotPuzzle(seed, DAILY_GAME_TIMER.whot_puzzle)
    }

    case 'word_grouping': {
      const { generateWordGroupingPuzzle } = await import('@/lib/daily-word-grouping')
      return generateWordGroupingPuzzle(seed, DAILY_GAME_TIMER.word_grouping)
    }

    case 'chess_mate': {
      const { generateChessMatePuzzle } = await import('@/lib/daily-chess-mate')
      return generateChessMatePuzzle(seed, DAILY_GAME_TIMER.chess_mate)
    }

    case 'codenames_codeword': {
      const { generateCodenamesPuzzle } = await import('@/lib/daily-codenames')
      return generateCodenamesPuzzle(seed, DAILY_GAME_TIMER.codenames_codeword)
    }
  }
}

/**
 * Build a daily puzzle from admin-curated content instead of the hardcoded banks.
 * Returns null if the content can't produce a valid puzzle (the caller falls back
 * to the normal algorithmic path).
 */
export async function generateDailyPuzzleFromContent(
  gameType: DailyChallengeGameType,
  seed: number,
  adminContent: unknown
): Promise<PuzzleResult | null> {
  if (adminContent == null) return null
  if (Array.isArray(adminContent) && adminContent.length === 0) return null

  switch (gameType) {
    case 'crossword': {
      const { generateCrossword, CROSSWORD_DIFFICULTY_SPECS } = await import('@/lib/crossword')
      const spec = CROSSWORD_DIFFICULTY_SPECS.medium
      const entries = (adminContent as { answer?: string; clue?: string }[])
        .filter((e) => e.answer && e.clue)
        .map((e) => ({ answer: e.answer!, clue: e.clue! }))
      if (entries.length < 4) return null

      for (let i = 0; i < 8; i++) {
        const result = generateCrossword(entries, {
          size: spec.size,
          seed: seed + i * 7919,
          targetWords: spec.targetWords,
          maxWordLength: spec.maxWordLength,
          minWords: Math.min(4, spec.targetWords),
        })
        if (result) {
          return {
            puzzleData: {
              metadata: { ...result.metadata, theme: 'admin', difficulty: 'medium' },
              solution: result.solution,
            },
            config: {
              timer: DAILY_GAME_TIMER.crossword,
              theme: 'admin',
              difficulty: 'medium',
              totalClues: result.metadata.clues?.length ?? 0,
            },
          }
        }
      }
      return null
    }

    case 'mini_crossword': {
      const { generateCrossword, CROSSWORD_DIFFICULTY_SPECS } = await import('@/lib/crossword')
      const spec = CROSSWORD_DIFFICULTY_SPECS.easy
      const entries = (adminContent as { answer?: string; clue?: string }[])
        .filter((e) => e.answer && e.clue)
        .map((e) => ({ answer: e.answer!, clue: e.clue! }))
      if (entries.length < 4) return null

      for (let i = 0; i < 8; i++) {
        const result = generateCrossword(entries, {
          size: spec.size,
          seed: seed + i * 7919,
          targetWords: spec.targetWords,
          maxWordLength: spec.maxWordLength,
          minWords: Math.min(4, spec.targetWords),
        })
        if (result) {
          return {
            puzzleData: {
              metadata: { ...result.metadata, theme: 'admin', difficulty: 'easy' },
              solution: result.solution,
            },
            config: {
              timer: DAILY_GAME_TIMER.mini_crossword,
              theme: 'admin',
              difficulty: 'easy',
              totalClues: result.metadata.clues?.length ?? 0,
            },
          }
        }
      }
      return null
    }

    case 'word_search': {
      const { generateWordSearch, WORD_SEARCH_DIFFICULTY_SPECS } = await import('@/lib/word-search')
      const spec = WORD_SEARCH_DIFFICULTY_SPECS.medium
      const words = (adminContent as string[]).filter((w) => typeof w === 'string' && w.length >= 3)
      if (words.length < 4) return null

      for (let i = 0; i < 8; i++) {
        const result = generateWordSearch(words, {
          size: spec.size,
          seed: seed + i * 7919,
          targetWords: spec.targetWords,
          directions: spec.directions,
          minWords: Math.min(4, spec.targetWords),
        })
        if (result) {
          return {
            puzzleData: {
              metadata: { ...result.metadata, theme: 'admin', difficulty: 'medium' },
              solution: result.solution,
            },
            config: {
              timer: DAILY_GAME_TIMER.word_search,
              theme: 'admin',
              difficulty: 'medium',
              totalWords: result.metadata.words?.length ?? 0,
            },
          }
        }
      }
      return null
    }

    case 'word_scramble': {
      const { buildWordScrambleFromEntries } = await import('@/lib/word-scramble-puzzles')
      const entries = (adminContent as { word?: string; clue?: string }[])
        .filter((e) => e.word)
        .map((e) => ({ word: e.word!, hint: e.clue ?? '' }))
      if (entries.length < 3) return null

      const result = buildWordScrambleFromEntries(entries, 'medium', seed)
      if (!result) return null

      return {
        puzzleData: {
          metadata: { ...result.metadata, theme: 'admin' },
          solution: result.solution,
        },
        config: {
          timer: DAILY_GAME_TIMER.word_scramble,
          theme: 'admin',
          difficulty: 'medium',
          totalWords: result.solution?.length ?? 0,
        },
      }
    }

    case 'trivia': {
      type TriviaEntry = { question?: string; choices?: string[]; correct_index?: number }
      const entries = (adminContent as TriviaEntry[]).filter(
        (e) => e.question && Array.isArray(e.choices) && e.choices.length >= 2 && typeof e.correct_index === 'number'
      )
      if (entries.length < 5) return null

      // Deterministic shuffle using the seed
      const shuffled = [...entries]
      let s = seed
      for (let i = shuffled.length - 1; i > 0; i--) {
        s = (Math.imul(s, 1664525) + 1013904223) | 0
        const j = (s >>> 0) % (i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }

      const questions = shuffled.map((e) => ({
        question: e.question!,
        choices: e.choices!,
        correct_index: e.correct_index!,
      }))

      return {
        puzzleData: {
          questions,
          solution: questions.map((q) => q.correct_index),
        },
        config: {
          timer: DAILY_GAME_TIMER.trivia,
          totalQuestions: questions.length,
        },
      }
    }

    case 'whot_puzzle':
      return null

    case 'word_grouping': {
      const { generateWordGroupingFromContent } = await import('@/lib/daily-word-grouping')
      return generateWordGroupingFromContent(adminContent, seed, DAILY_GAME_TIMER.word_grouping)
    }

    case 'chess_mate': {
      const { generateChessMateFromContent } = await import('@/lib/daily-chess-mate')
      return generateChessMateFromContent(adminContent, seed, DAILY_GAME_TIMER.chess_mate)
    }

    case 'codenames_codeword': {
      const { generateCodenamesFromContent } = await import('@/lib/daily-codenames')
      return generateCodenamesFromContent(adminContent, seed, DAILY_GAME_TIMER.codenames_codeword)
    }

    default:
      return null
  }
}
