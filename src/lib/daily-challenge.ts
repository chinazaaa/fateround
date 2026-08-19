import { watToday } from '@/lib/community-dates'
import { hashWord } from '@/lib/daily-word-hash'
import type { CrosswordClue } from '@/lib/crossword'

// ---------------------------------------------------------------------------
// Game types eligible for the daily challenge
// ---------------------------------------------------------------------------

export const DAILY_CHALLENGE_GAME_TYPES = [
  'sudoku',
  'word_hunt',
  'crossword',
  'mini_crossword',
  'word_search',
  'word_scramble',
  'trivia',
  'whot_puzzle',
  'word_grouping',
  'chess_mate',
  'codenames_codeword',
  'ludo_puzzle',
  'wordle',
] as const

export type DailyChallengeGameType = (typeof DAILY_CHALLENGE_GAME_TYPES)[number]

export function isDailyChallengeGameType(value: string): value is DailyChallengeGameType {
  return (DAILY_CHALLENGE_GAME_TYPES as readonly string[]).includes(value)
}

export const DAILY_GAME_SLUG_TO_TYPE: Record<string, DailyChallengeGameType> = {
  sudoku: 'sudoku',
  'word-hunt': 'word_hunt',
  crossword: 'crossword',
  'mini-crossword': 'mini_crossword',
  'word-search': 'word_search',
  'word-scramble': 'word_scramble',
  trivia: 'trivia',
  'whot-puzzle': 'whot_puzzle',
  'word-grouping': 'word_grouping',
  'chess-mate': 'chess_mate',
  'codenames-codeword': 'codenames_codeword',
  'ludo-puzzle': 'ludo_puzzle',
  wordle: 'wordle',
}

export const DAILY_GAME_TYPE_TO_SLUG: Record<DailyChallengeGameType, string> = {
  sudoku: 'sudoku',
  word_hunt: 'word-hunt',
  crossword: 'crossword',
  mini_crossword: 'mini-crossword',
  word_search: 'word-search',
  word_scramble: 'word-scramble',
  trivia: 'trivia',
  whot_puzzle: 'whot-puzzle',
  word_grouping: 'word-grouping',
  chess_mate: 'chess-mate',
  codenames_codeword: 'codenames-codeword',
  ludo_puzzle: 'ludo-puzzle',
  wordle: 'wordle',
}

export const DAILY_GAME_LABELS: Record<DailyChallengeGameType, string> = {
  sudoku: 'Sudoku',
  word_hunt: 'Word Hunt',
  crossword: 'Crossword',
  mini_crossword: 'Mini Crossword',
  word_search: 'Word Search',
  word_scramble: 'Word Scramble',
  trivia: 'Trivia',
  whot_puzzle: 'Whot Puzzle',
  word_grouping: 'Word Grouping',
  chess_mate: 'Chess Mate',
  codenames_codeword: 'Codeword',
  ludo_puzzle: 'Ludo Puzzle',
  wordle: 'Wordle',
}

export const DAILY_GAME_EMOJIS: Record<DailyChallengeGameType, string> = {
  sudoku: '🔢',
  word_hunt: '🔤',
  crossword: '📝',
  mini_crossword: '✏️',
  word_search: '🔍',
  word_scramble: '🔀',
  trivia: '🧠',
  whot_puzzle: '🃏',
  word_grouping: '🔗',
  chess_mate: '♟️',
  codenames_codeword: '🕵️',
  ludo_puzzle: '🎲',
  wordle: '🔠',
}

// Default timer per game (seconds). Time-first games get a countdown;
// score-first (word_hunt, trivia) also has a timer since it's a timed race.
export const DAILY_GAME_TIMER: Record<DailyChallengeGameType, number> = {
  sudoku: 300,
  word_hunt: 180,
  crossword: 300,
  mini_crossword: 120,
  word_search: 300,
  word_scramble: 300,
  trivia: 90,
  whot_puzzle: 300,
  word_grouping: 240,
  chess_mate: 180,
  codenames_codeword: 180,
  ludo_puzzle: 300,
  wordle: 300,
}

// Whether the primary metric is time (lower is better) or score (higher is better).
export const DAILY_GAME_PRIMARY_METRIC: Record<DailyChallengeGameType, 'time' | 'score'> = {
  sudoku: 'time',
  word_hunt: 'score',
  crossword: 'time',
  mini_crossword: 'time',
  word_search: 'time',
  word_scramble: 'time',
  trivia: 'score',
  whot_puzzle: 'score',
  word_grouping: 'score',
  chess_mate: 'time',
  codenames_codeword: 'score',
  ludo_puzzle: 'score',
  wordle: 'score',
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
  // Mask to 31 bits: keeps the seed in [0, 2^31-1] so it fits Postgres `integer` (int4). An
  // unsigned 32-bit value (`>>> 0`) overflows int4 for ~half of inputs, which made the
  // daily_challenges insert fail ("integer out of range") and surfaced as "Failed to load".
  return hash & 0x7fffffff
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
  const speedRatio = maxTimeSeconds > 0 ? Math.max(0, 1 - timeSeconds / maxTimeSeconds) : completionRatio > 0 ? 1 : 0
  const penaltyRatio = maxHints > 0 ? Math.min(1, hintsUsed / maxHints) : 0

  // completion 800 + speed 200 → a fully-solved, instant run reaches the full 1000; a full but
  // slow solve is 800. (Hints removed from daily games, so penalty is effectively 0.)
  const raw = completionRatio * 800 + speedRatio * 200 - penaltyRatio * 100
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
    // Don't ship the answer list, but give the client hashes so it can reject non-words in-play
    // without being able to read every answer. The server still re-validates on submit.
    const validWords = Array.isArray(safe.valid_words) ? (safe.valid_words as string[]) : []
    safe.valid_word_hashes = validWords.map(hashWord)
    delete safe.valid_words
  }

  if (gameType === 'crossword' || gameType === 'mini_crossword') {
    // Per-clue answer hashes (parallel to metadata.clues) so the client can mark a completed
    // across/down word correct WITHOUT ever receiving the solution grid. Answers are 5–8 letters,
    // so the hashes aren't brute-forceable. Computed from the (pre-strip) solution grid.
    const solution = Array.isArray(puzzleData.solution) ? (puzzleData.solution as string[][]) : []
    const metadata = puzzleData.metadata as { clues?: CrosswordClue[] } | undefined
    safe.answer_hashes = (metadata?.clues ?? []).map((c) => {
      let word = ''
      for (let i = 0; i < c.length; i++) {
        const r = c.direction === 'across' ? c.row : c.row + i
        const col = c.direction === 'across' ? c.col + i : c.col
        word += solution[r]?.[col] ?? ''
      }
      return hashWord(word)
    })
  }

  if (gameType === 'word_scramble') {
    // Per-word answer hashes (parallel to metadata.scrambles) so the client can accept a correct
    // unscramble and reject rubbish, without shipping the answers. Server still re-validates.
    const solution = Array.isArray(puzzleData.solution) ? (puzzleData.solution as string[]) : []
    safe.answer_hashes = solution.map(hashWord)
  }

  if (gameType === 'trivia') {
    // Strip correct_index from each question — the client doesn't need it during play.
    // The server re-verifies on submit.
    const questions = Array.isArray(safe.questions) ? (safe.questions as Record<string, unknown>[]) : []
    safe.questions = questions.map(({ correct_index: _, ...rest }) => rest)
  }

  if (gameType === 'whot_puzzle') {
    delete safe.solution
  }

  if (gameType === 'word_grouping') {
    // Keep groups available as _groups for client-side real-time correct/incorrect feedback.
    // The shuffled `words` array already hides which words belong together.
    const solution = puzzleData.solution as
      | { groups?: Array<{ category: string; words: string[]; difficulty: number }> }
      | undefined
    if (solution?.groups) {
      safe._groups = solution.groups
    }
    delete safe.solution
  }

  if (gameType === 'chess_mate') {
    const solution = puzzleData.solution as { lines?: string[][] } | undefined
    if (solution?.lines) {
      safe.solutionLines = solution.lines
    }
    delete safe.solution
  }

  if (gameType === 'codenames_codeword') {
    delete safe.solution
  }

  if (gameType === 'ludo_puzzle') {
    delete safe.solution
  }

  if (gameType === 'wordle') {
    // Deliberate exception to the "never ship the answer" rule: Wordle's client must grade each
    // guess letter-by-letter for instant feedback, which requires the word. Score integrity is
    // preserved because the submit route RE-GRADES every submitted guess server-side against
    // puzzle_data.word and derives score/rank from its own grading (see verifyWordle). The word
    // is also shown on a loss anyway.
  }

  return safe
}

// Puzzle generation (generateDailyPuzzle) lives in ./daily-challenge-server because it pulls in
// Node's `fs` (via word-hunt-dictionary) and this module is imported by client components.

// ---------------------------------------------------------------------------
// Challenge number — days since launch (for display: "Daily Sudoku #42")
// ---------------------------------------------------------------------------

// Launch day = Day 1. Puzzles are seeded per calendar date regardless; this only sets the "#N" label.
const DAILY_CHALLENGE_EPOCH = '2026-08-05'

export function getDailyChallengeNumber(dateStr: string): number {
  const epoch = new Date(`${DAILY_CHALLENGE_EPOCH}T00:00:00Z`).getTime()
  const current = new Date(`${dateStr}T00:00:00Z`).getTime()
  // Clamp to >= 1 so pre-launch/test dates (before the epoch) never render "#0" or "#-15".
  return Math.max(1, Math.floor((current - epoch) / (24 * 60 * 60 * 1000)) + 1)
}

/** The public launch date (Day 1). Before this the daily challenge is dormant. */
export const DAILY_CHALLENGE_LAUNCH = DAILY_CHALLENGE_EPOCH

/** Is the daily challenge live yet? Lets us ship the code ahead of launch but keep it dormant. */
export function isDailyChallengeLive(today: string = watToday()): boolean {
  return today >= DAILY_CHALLENGE_EPOCH
}

// Re-export for convenience
export { watToday }
