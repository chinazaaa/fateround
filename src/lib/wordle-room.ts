// Wordle Room engine — the multiplayer race mode (design spec §7).
//
// Pure functions shared by:
//   - the client (the player view grades the current word locally for instant feedback
//     and computes live standings from `wordle_room_progress` rows)
//   - the server (start route builds the seeded sequence; the guess route re-grades
//     every submission server-side, so a forged solve can't score)
//
// Anti-cheat model: the room's full word sequence is NEVER shipped to the client. Only
// the current word is revealed (via the authenticated guess/status route), so nobody can
// read ahead in a competitive race. The server re-grades on every submission, applies a
// per-word min-duration floor, and the standings comparator is server-authoritative
// (`getCompetitiveStandings` in room-points.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'
import { markGameFinished } from '@/lib/game-finish'
import { msUntilDeadline } from '@/lib/round-timing'
import type { Game } from '@/types'
import { WORDLE_GENERAL_ENGLISH } from '@/data/daily-banks/wordle-general-english'
import { WORDLE_NAIJA_SLANG, type WordleSlangEntry } from '@/data/daily-banks/wordle-naija-slang'
import {
  WORDLE_SPORTS,
  WORDLE_FOOD,
  WORDLE_ANIMALS,
  WORDLE_TECHNOLOGY,
  WORDLE_NATURE,
  WORDLE_MUSIC,
  WORDLE_SCIENCE,
  WORDLE_CLOTHING,
  WORDLE_TRAVEL,
} from '@/data/daily-banks/wordle-categories'
import type { WordleCategoryId, WordleLetterState } from '@/lib/daily-wordle'
import { normalizeWordleWord, wordleBasePoints, wordleMaxAttempts, gradeWordleGuess } from '@/lib/daily-wordle'

// ── Constants ────────────────────────────────────────────────────────────────

export const WORDLE_ROOM_MIN_PLAYERS = 1
export const WORDLE_ROOM_MAX_PLAYERS = 20
export const WORDLE_ROOM_DEFAULT_MAX_PLAYERS = 20

/** How many words the game covers (spec §7 setup). */
export const WORDLE_ROOM_WORD_COUNT_OPTIONS = [5, 10, 15, 20] as const
export const WORDLE_ROOM_DEFAULT_WORD_COUNT = 5
export type WordleRoomWordCount = (typeof WORDLE_ROOM_WORD_COUNT_OPTIONS)[number]

/** Whole-game timer options (seconds). 0 = untimed (runs until everyone finishes). */
export const WORDLE_ROOM_TIMER_OPTIONS = [0, 120, 300, 600, 900] as const
export const WORDLE_ROOM_DEFAULT_TIMER = 0

/**
 * Sample CSV shown as a downloadable template under "Your own" for Wordle pools. The parser
 * (`parsePuzzleThemeCsv('wordle_room', csv)`) accepts `word,hint` per line — hint is optional.
 * Words must be 3–8 letters; the parser normalises to lowercase + strips non-a-z.
 */
export const WORDLE_ROOM_SAMPLE_CSV = [
  'word,hint',
  'apple,A common fruit',
  'happy,Feeling of joy',
  'chair,You sit on it',
  'music,Sounds arranged into songs',
  'river,Flowing water',
  'plant,Grows in soil',
  'ocean,Big salty water',
  'smile,Curved mouth of happiness',
  '',
].join('\n')

/** Per-word min-duration floor (ms) between guesses on the same word — a guess submitted
 *  faster than this is physically implausible and rejected (spec §7 anti-cheat). */
export const WORDLE_ROOM_MIN_GUESS_INTERVAL_MS = 800

/** Client may call expire slightly before the server deadline — allow a small grace window (ms). */
export const WORDLE_ROOM_EXPIRE_GRACE_MS = 2500

// ── Types ────────────────────────────────────────────────────────────────────

export interface WordleRoomMetadata {
  category: WordleCategoryId
  categoryLabel: string
  word_count: WordleRoomWordCount
  seed: number
}

export interface WordleRoomGuessRow {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word_index: number
  guess: string
  state: WordleLetterState[]
  is_correct: boolean
  points_awarded: number
  submitted_at: string
}

export interface WordleRoomProgressRow {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word_index: number
  current_word_guesses: number
  words_solved: number
  total_guesses: number
  total_points: number
  total_time_ms: number | null
  finished: boolean
  finished_at: string | null
  created_at: string
  updated_at: string
  hints_used?: number[]
}

export interface WordleRoomStandingRow {
  player_id: string
  name: string
  word_index: number
  words_solved: number
  total_guesses: number
  total_time_ms: number | null
  finished: boolean
  total_points: number
  hints_used_count: number
}

export interface WordleRoomWordResult {
  solved: boolean
  guessesUsed: number
  maxAttempts: number
  pointsAwarded: number
  nextWordIndex: number
  wordsSolvedDelta: number
  finished: boolean
}

// ── Category access ──────────────────────────────────────────────────────────

interface WordleRoomCategory {
  label: string
  entries: { word: string; hint: string }[]
}

const themedRoomCategory = (label: string, words: readonly string[]): WordleRoomCategory => ({
  label,
  entries: words.map((word) => ({ word, hint: label })),
})

const WORDLE_ROOM_CATEGORIES: Record<WordleCategoryId, WordleRoomCategory> = {
  general_english: {
    label: 'General English',
    entries: WORDLE_GENERAL_ENGLISH.map((word) => ({ word, hint: '' })),
  },
  naija_slang: {
    label: 'Naija Slang',
    entries: (WORDLE_NAIJA_SLANG as readonly WordleSlangEntry[]).map((e) => ({ word: e.word, hint: e.hint })),
  },
  sports: themedRoomCategory('Sports', WORDLE_SPORTS),
  food: themedRoomCategory('Food & Drink', WORDLE_FOOD),
  animals: themedRoomCategory('Animals', WORDLE_ANIMALS),
  technology: themedRoomCategory('Technology', WORDLE_TECHNOLOGY),
  nature: themedRoomCategory('Nature', WORDLE_NATURE),
  music: themedRoomCategory('Music', WORDLE_MUSIC),
  science: themedRoomCategory('Science', WORDLE_SCIENCE),
  clothing: themedRoomCategory('Clothing & Fashion', WORDLE_CLOTHING),
  travel: themedRoomCategory('Travel & Places', WORDLE_TRAVEL),
}

const VALID_CATEGORY_IDS: readonly WordleCategoryId[] = [
  'general_english',
  'naija_slang',
  'sports',
  'food',
  'animals',
  'technology',
  'nature',
  'music',
  'science',
  'clothing',
  'travel',
]

export function wordleRoomCategoryLabel(category: WordleCategoryId): string {
  return WORDLE_ROOM_CATEGORIES[category]?.label ?? 'General English'
}

export function clampWordleRoomCategory(raw: unknown): WordleCategoryId {
  return typeof raw === 'string' && (VALID_CATEGORY_IDS as readonly string[]).includes(raw)
    ? (raw as WordleCategoryId)
    : 'general_english'
}

export function clampWordleRoomWordCount(raw: unknown): WordleRoomWordCount {
  const n = Number(raw)
  return (WORDLE_ROOM_WORD_COUNT_OPTIONS as readonly number[]).includes(n)
    ? (n as WordleRoomWordCount)
    : WORDLE_ROOM_DEFAULT_WORD_COUNT
}

export function clampWordleRoomTimer(seconds: unknown): number {
  const n = Number(seconds)
  return (WORDLE_ROOM_TIMER_OPTIONS as readonly number[]).includes(n) ? n : WORDLE_ROOM_DEFAULT_TIMER
}

export function wordleRoomMaxAttemptsForWord(word: string): number {
  return wordleMaxAttempts(normalizeWordleWord(word).length)
}

// ── Sequence generation — deterministic per (seed, category) ─────────────────

function xorshift(seed: number) {
  let s = (seed ^ 0x9e3779b9) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

/**
 * Build the room's fixed word sequence. Seeded per room and independent of the daily
 * seed, so a multiplayer round never spoils or reuses that day's Daily Challenge word.
 * Fisher–Yates over the category's bank with a seeded rng, then take the first `count`.
 * Returns normalized lowercase words. The sequence is stored server-only (never in the
 * anon-readable round metadata).
 */
export interface WordleRoomSequenceEntry {
  word: string
  hint: string
}

export function buildWordleRoomSequence(
  seed: number,
  category: WordleCategoryId,
  count: WordleRoomWordCount
): WordleRoomSequenceEntry[] {
  const cat = WORDLE_ROOM_CATEGORIES[category] ?? WORDLE_ROOM_CATEGORIES.general_english
  const rng = xorshift(seed)
  const indices = cat.entries.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices.slice(0, count).map((idx) => {
    const e = cat.entries[idx]!
    return { word: normalizeWordleWord(e.word), hint: e.hint }
  })
}

/**
 * Tolerate both storage shapes in wordle_room_solutions.words: the legacy `string[]`
 * (old rounds) and the current `{word, hint}[]` (new rounds after the sequence enrichment).
 * Returns { words, hints } aligned by index, hints defaulting to '' when unavailable.
 */
export function parseWordleRoomSolutionWords(raw: unknown): { words: string[]; hints: string[] } {
  const words: string[] = []
  const hints: string[] = []
  if (!Array.isArray(raw)) return { words, hints }
  for (const item of raw) {
    if (typeof item === 'string') {
      words.push(normalizeWordleWord(item))
      hints.push('')
    } else if (item && typeof item === 'object') {
      const rec = item as { word?: unknown; hint?: unknown }
      words.push(normalizeWordleWord(typeof rec.word === 'string' ? rec.word : ''))
      hints.push(typeof rec.hint === 'string' ? rec.hint : '')
    }
  }
  return { words, hints }
}

export function parseWordleRoomMetadata(raw: unknown): WordleRoomMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (m.category !== 'general_english' && m.category !== 'naija_slang') return null
  if (typeof m.word_count !== 'number') return null
  return m as unknown as WordleRoomMetadata
}

// ── Round + progress rows ────────────────────────────────────────────────────

export function buildWordleRoomRoundRow(gameId: string, metadata: WordleRoomMetadata) {
  return {
    game_id: gameId,
    round_number: 1,
    status: 'active' as const,
    started_at: new Date().toISOString(),
    participant_ids: [] as string[],
    wordle_room_metadata: metadata,
  }
}

export function buildWordleRoomProgressRows(gameId: string, roundId: string, playerIds: string[]) {
  return playerIds.map((playerId) => ({
    game_id: gameId,
    round_id: roundId,
    player_id: playerId,
    word_index: 0,
    current_word_guesses: 0,
    words_solved: 0,
    total_guesses: 0,
    total_time_ms: null,
    finished: false,
    finished_at: null,
  }))
}

export async function clearWordleRoomSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['wordle_room_guesses', 'wordle_room_progress', 'wordle_room_solutions'])
}

// ── Timer / expiry ───────────────────────────────────────────────────────────

export function wordleRoomDeadlineMs(sessionStartedAt: string | null | undefined, timerSeconds: number): number | null {
  if (!sessionStartedAt) return null
  const seconds = clampWordleRoomTimer(timerSeconds)
  if (seconds <= 0) return null
  return new Date(sessionStartedAt).getTime() + seconds * 1000
}

export function wordleRoomTimeRemainingMs(
  sessionStartedAt: string | null | undefined,
  timerSeconds: number,
  now = Date.now()
): number | null {
  const deadline = wordleRoomDeadlineMs(sessionStartedAt, timerSeconds)
  if (deadline === null) return null
  return Math.max(0, deadline - now)
}

export function wordleRoomTimerSeconds(timerSeconds: number | null | undefined): number {
  return clampWordleRoomTimer(timerSeconds)
}

export function formatWordleRoomTimer(seconds: number): string {
  if (seconds <= 0) return 'Untimed'
  if (seconds === 120) return '2 minutes'
  if (seconds === 300) return '5 minutes'
  if (seconds === 600) return '10 minutes'
  if (seconds === 900) return '15 minutes'
  return `${seconds}s`
}

export function wordleRoomSessionExpired(
  sessionStartedAt: string | null | undefined,
  timerSeconds: number | null | undefined,
  graceMs = 0
): boolean {
  if (!sessionStartedAt) return false
  const seconds = clampWordleRoomTimer(timerSeconds)
  if (seconds <= 0) return false
  return msUntilDeadline(sessionStartedAt, seconds) <= graceMs
}

export async function finishExpiredWordleRoomGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'timer_seconds'>,
  options?: { graceMs?: number }
): Promise<boolean> {
  if (game.status === 'finished') return true
  if (game.status !== 'active') return false
  const graceMs = options?.graceMs ?? 0
  if (!wordleRoomSessionExpired(game.session_started_at, game.timer_seconds, graceMs)) return false

  const { error } = await markGameFinished(supabase, game.id)
  return !error
}

// ── Guess grading + progression ──────────────────────────────────────────────

export function validateWordleRoomGuess(
  rawGuess: unknown,
  word: string
): { ok: true; normalized: string; states: WordleLetterState[] } | { ok: false; error: string } {
  if (typeof rawGuess !== 'string') return { ok: false, error: 'Guess must be a string' }
  const normalized = normalizeWordleWord(rawGuess)
  if (normalized.length !== normalizeWordleWord(word).length) {
    return { ok: false, error: `Guess must be ${normalizeWordleWord(word).length} letters` }
  }
  const states = gradeWordleGuess(normalized, word)
  return { ok: true, normalized, states }
}

/**
 * Advance one player one guess through the sequence. Pure + deterministic so the client
 * can preview and the server can re-grade with identical results.
 *
 * - Solving a word scores it (base + perfect bonus) and advances.
 * - Exhausting a word's attempts without solving scores it as a loss (0) and advances —
 *   nobody gets permanently stuck (spec §7).
 */
export function evaluateWordleRoomGuess(
  wordIndex: number,
  currentWordGuesses: number,
  isCorrect: boolean,
  maxAttempts: number,
  wordCount: number,
  hintUsed: boolean = false
): WordleRoomWordResult {
  const guessesUsed = currentWordGuesses + 1
  const solved = isCorrect
  const pointsAwarded = wordleRoomWordScore(guessesUsed, maxAttempts, solved, hintUsed)
  const wordDone = solved || guessesUsed >= maxAttempts
  const nextWordIndex = wordDone ? wordIndex + 1 : wordIndex
  const finished = wordDone && nextWordIndex >= wordCount
  return {
    solved,
    guessesUsed,
    maxAttempts,
    pointsAwarded,
    nextWordIndex,
    wordsSolvedDelta: solved ? 1 : 0,
    finished,
  }
}

// ── Scoring (spec §7 — per-word, no streaks) ─────────────────────────────────

/** Deducted from that word's earned score when the player reveals its hint mid-play. */
export const WORDLE_ROOM_HINT_COST = 300

export function wordleRoomWordScore(
  guessesUsed: number,
  maxAttempts: number,
  won: boolean,
  hintUsed: boolean = false
): number {
  if (!won) return 0
  const base = wordleBasePoints(guessesUsed, maxAttempts)
  const perfect = guessesUsed === 1 ? 200 : 0
  const hintCost = hintUsed ? WORDLE_ROOM_HINT_COST : 0
  return Math.max(0, base + perfect - hintCost)
}

/** Total game score = sum of per-word scores across the whole sequence. */
export function wordleRoomTotalScore(guessRows: Pick<WordleRoomGuessRow, 'points_awarded'>[]): number {
  return guessRows.reduce((sum, g) => sum + g.points_awarded, 0)
}

// ── Standings (spec §7 ranking) ──────────────────────────────────────────────

export interface WordleRoomStandingInput {
  player_id: string
  words_solved: number
  total_guesses: number
  total_time_ms: number | null
  finished: boolean
  /** Sum of per-word `points_awarded` after hint deductions. Legacy rows that predate
   *  the points-primary ranking default to 0, which sinks them below any real player. */
  total_points?: number
}

/**
 * Rank players by:
 *  1. Total points — solving more words adds points; solving in fewer guesses adds more
 *     per word; purchasing a hint deducts 300 from that word's earned points. So the
 *     honest, thorough player wins by construction, and hints can never be a free ride
 *     to the top of the leaderboard.
 *  2. Tie → faster total completion time (only meaningful for finishers; for a timed
 *     cutoff, ranking effectively stops at rule 1 for unfinished players).
 * Then name as a stable final tiebreak.
 */
export function rankWordleRoomStandings<T extends WordleRoomStandingInput>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (b.total_points ?? 0) - (a.total_points ?? 0) ||
      (a.finished ? (a.total_time_ms ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER) -
        (b.finished ? (b.total_time_ms ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER)
  )
}

export function tallyWordleRoomScores(
  progress: ReadonlyArray<
    Pick<
      WordleRoomProgressRow,
      'player_id' | 'word_index' | 'words_solved' | 'total_guesses' | 'total_time_ms' | 'finished'
    > & { total_points?: number | null; hints_used?: unknown }
  >,
  players: { id: string; name: string; spectator?: boolean | null }[]
): WordleRoomStandingRow[] {
  const active = players.filter((p) => p.spectator !== true)
  const byPlayer = new Map(progress.map((p) => [p.player_id, p]))
  return rankWordleRoomStandings(
    active.map((p) => {
      const row = byPlayer.get(p.id)
      const hintsCount = Array.isArray(row?.hints_used) ? (row!.hints_used as unknown[]).length : 0
      return {
        player_id: p.id,
        name: p.name,
        word_index: row?.word_index ?? 0,
        words_solved: row?.words_solved ?? 0,
        total_guesses: row?.total_guesses ?? 0,
        total_time_ms: row?.total_time_ms ?? null,
        finished: row?.finished ?? false,
        total_points: row?.total_points ?? 0,
        hints_used_count: hintsCount,
      }
    })
  )
}
