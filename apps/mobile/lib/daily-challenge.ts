/**
 * Daily Challenge constants — mobile mirror of `src/lib/daily-challenge.ts`.
 *
 * Client-only pure constants: game types, labels, timers, launch date, seed
 * helpers. Deliberately does NOT re-export the server-side puzzle generation
 * or solution-stripping code — those stay on web. The mobile client fetches
 * already-stripped puzzles from `/api/daily-challenges/[gameType]`.
 */

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

/** Default timer per game (seconds). Kept in sync with `src/lib/daily-challenge.ts`. */
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

// Launch day = Day 1. Mirror `DAILY_CHALLENGE_EPOCH` on web.
const DAILY_CHALLENGE_EPOCH = '2026-08-05'

export function getDailyChallengeNumber(dateStr: string): number {
  const epoch = new Date(`${DAILY_CHALLENGE_EPOCH}T00:00:00Z`).getTime()
  const current = new Date(`${dateStr}T00:00:00Z`).getTime()
  return Math.max(1, Math.floor((current - epoch) / (24 * 60 * 60 * 1000)) + 1)
}

export const DAILY_CHALLENGE_LAUNCH = DAILY_CHALLENGE_EPOCH

export function isDailyChallengeLive(today: string): boolean {
  return today >= DAILY_CHALLENGE_EPOCH
}

