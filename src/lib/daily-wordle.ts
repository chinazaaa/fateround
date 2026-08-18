// Daily Wordle engine — client-safe (no fs / Node APIs).
//
// Pure functions shared by:
//   - the client (DailyWordlePlay grades each guess for instant feedback)
//   - the server (daily-challenge-server generates the day's puzzle; the submit route
//     re-grades every submitted guess so a forged win can't score)
//
// Anti-cheat note: Wordle is the ONE daily game whose solution must ship to the client (the client
// grades letters locally for instant feedback). Score integrity is preserved by the submit route
// re-grading `submission.guesses` against `puzzle_data.word` server-side and deriving score, rank
// and the share grid from ITS grading, never from the client's reported result.

import { WORDLE_GENERAL_ENGLISH } from '@/data/daily-banks/wordle-general-english'
import { WORDLE_NAIJA_SLANG, type WordleSlangEntry } from '@/data/daily-banks/wordle-naija-slang'

export type WordleCategoryId = 'general_english' | 'naija_slang'
export type WordleLetterState = 'correct' | 'present' | 'absent'

export interface WordlePuzzleData {
  category: WordleCategoryId
  categoryLabel: string
  /** The day's target word (lowercase). Shipped to the client so it can grade; server re-grades on submit. */
  word: string
  /** Hint shown after a loss. Empty for General English (the word is the whole puzzle). */
  hint: string
  length: number
  maxAttempts: number
}

// ---------------------------------------------------------------------------
// Word bank + deterministic per-day selection
// ---------------------------------------------------------------------------

interface WordleBankEntry {
  word: string
  hint: string
}

interface WordleCategory {
  id: WordleCategoryId
  label: string
  entries: WordleBankEntry[]
}

const WORDLE_CATEGORIES: readonly WordleCategory[] = [
  {
    id: 'general_english',
    label: 'General English',
    entries: WORDLE_GENERAL_ENGLISH.map((word) => ({ word, hint: '' })),
  },
  {
    id: 'naija_slang',
    label: 'Naija Slang',
    entries: (WORDLE_NAIJA_SLANG as readonly WordleSlangEntry[]).map((e) => ({ word: e.word, hint: e.hint })),
  },
]

/** LCG-mix a seed so adjacent daily seeds don't trivially alternate category. Deterministic. */
function seededIndex(seed: number, length: number): number {
  const s = Math.imul(seed, 1664525) + 1013904223
  return (((s >>> 0) % length) + length) % length
}

/**
 * Build the day's puzzle from the deterministic daily seed — picks the category for the day
 * (same for everyone), then a word from that category's bank. The daily word is seeded
 * independently of any multiplayer round, so a multiplayer Wordle never spoils today's answer.
 */
export function buildWordlePuzzle(seed: number): WordlePuzzleData {
  const category = WORDLE_CATEGORIES[seededIndex(seed, WORDLE_CATEGORIES.length)]!
  const entries = category.entries
  const wordIndex = ((seed % entries.length) + entries.length) % entries.length
  const entry = entries[wordIndex]!
  const word = normalizeWordleWord(entry.word)

  return {
    category: category.id,
    categoryLabel: category.label,
    word,
    hint: entry.hint,
    length: word.length,
    maxAttempts: wordleMaxAttempts(word.length),
  }
}

/**
 * Build the day's puzzle from admin-curated content. Returns null when the content can't produce
 * a valid puzzle so the caller falls back to the algorithmic path (built-in bank). Category is
 * reported as "custom"; label defaults to "Daily" and can be overridden per-entry.
 */
export function buildWordlePuzzleFromContent(seed: number, adminContent: unknown): WordlePuzzleData | null {
  if (!Array.isArray(adminContent) || adminContent.length === 0) return null
  type AdminEntry = { word: string; hint: string; categoryLabel: string }
  const entries: AdminEntry[] = []
  for (const raw of adminContent) {
    if (raw == null || typeof raw !== 'object') continue
    const rec = raw as { word?: unknown; hint?: unknown; categoryLabel?: unknown }
    const word = normalizeWordleWord(typeof rec.word === 'string' ? rec.word : '')
    if (word.length < 3 || word.length > 8) continue
    const hint = typeof rec.hint === 'string' ? rec.hint : ''
    const categoryLabel = typeof rec.categoryLabel === 'string' ? rec.categoryLabel.trim() : ''
    entries.push({ word, hint, categoryLabel })
  }
  if (entries.length === 0) return null

  const idx = ((seed % entries.length) + entries.length) % entries.length
  const entry = entries[idx]!

  return {
    category: 'general_english',
    categoryLabel: entry.categoryLabel || 'Daily',
    word: entry.word,
    hint: entry.hint,
    length: entry.word.length,
    maxAttempts: wordleMaxAttempts(entry.word.length),
  }
}

// ---------------------------------------------------------------------------
// Normalization + attempts
// ---------------------------------------------------------------------------

export function normalizeWordleWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/** Attempts scale with word length: 5 letters → 6 attempts, 3 letters → 4, etc. */
export function wordleMaxAttempts(wordLength: number): number {
  return wordLength + 1
}

// ---------------------------------------------------------------------------
// Letter grading — standard Wordle duplicate-letter rules
// ---------------------------------------------------------------------------
// Priority order per the spec: Correct > Present > Absent. Duplicates are handled in the standard
// way (guessing "ARRAY" against a word with one R marks only one R present/correct, the other
// absent): correct letters claim their instance first, then present letters claim from whatever's
// left, so a letter can never be over-counted.

export function gradeWordleGuess(guess: string, target: string): WordleLetterState[] {
  const g = normalizeWordleWord(guess)
  const t = normalizeWordleWord(target)
  const length = t.length
  const states: WordleLetterState[] = new Array(length).fill('absent')
  if (g.length !== length) return states // caller already guards length; keep it safe anyway

  const remaining = new Map<string, number>()
  for (const ch of t) remaining.set(ch, (remaining.get(ch) ?? 0) + 1)

  // Pass 1: exact-position matches claim their instance.
  for (let i = 0; i < length; i++) {
    if (g[i] === t[i]) {
      states[i] = 'correct'
      remaining.set(g[i], (remaining.get(g[i]) ?? 0) - 1)
    }
  }
  // Pass 2: remaining in-word letters get present/absent against leftover instances.
  for (let i = 0; i < length; i++) {
    if (states[i] === 'correct') continue
    const ch = g[i]
    const left = remaining.get(ch) ?? 0
    if (left > 0) {
      states[i] = 'present'
      remaining.set(ch, left - 1)
    }
  }
  return states
}

/** A guess is a correct solution if it grades all-correct (length-agnostic). */
export function isWinningGuess(guess: string, target: string): boolean {
  return normalizeWordleWord(guess) === normalizeWordleWord(target)
}

// ---------------------------------------------------------------------------
// Keyboard "best known state" — once a key is correct it stays correct
// ---------------------------------------------------------------------------

const STATE_PRIORITY: Record<WordleLetterState, number> = { correct: 3, present: 2, absent: 1 }

/**
 * Best-known state per letter across all guesses so far. A key only upgrades (absent → present →
 * correct), never downgrades — matching the spec's cumulative keyboard rule.
 */
export function wordleKeyBestStates(guesses: readonly string[], target: string): Map<string, WordleLetterState> {
  const best = new Map<string, WordleLetterState>()
  for (const guess of guesses) {
    const states = gradeWordleGuess(guess, target)
    for (let i = 0; i < states.length; i++) {
      const ch = normalizeWordleWord(guess)[i]
      if (!ch) continue
      const current = best.get(ch)
      if (!current || STATE_PRIORITY[states[i]!] > STATE_PRIORITY[current]) {
        best.set(ch, states[i]!)
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Scoring — fewer guesses = more points (spec §6)
// ---------------------------------------------------------------------------
// base_points = round(1000 - (guesses_used - 1) * (600 / (max_attempts - 1)))
// Always pays 1000 for a guess-1 win and 400 for a last-guess win, evenly stepped in between,
// regardless of the category's attempt count. A loss pays 0.

export const WORDLE_PERFECT_BONUS = 200
/** Deducted from the final score when the player reveals the hint during play. */
export const WORDLE_HINT_COST = 300

export function wordleBasePoints(guessesUsed: number, maxAttempts: number): number {
  const attempts = Math.max(2, maxAttempts) // guard div-by-zero; real minimum is 4 anyway
  const used = Math.max(1, Math.min(guessesUsed, attempts))
  return Math.round(1000 - (used - 1) * (600 / (attempts - 1)))
}

export function wordleFinalScore(
  guessesUsed: number,
  maxAttempts: number,
  won: boolean,
  hintUsed: boolean = false
): number {
  if (!won) return 0
  const base = wordleBasePoints(guessesUsed, maxAttempts)
  const perfect = guessesUsed === 1 ? WORDLE_PERFECT_BONUS : 0
  const hintCost = hintUsed ? WORDLE_HINT_COST : 0
  return Math.max(0, base + perfect - hintCost)
}

// ---------------------------------------------------------------------------
// Share grid — spoiler-free emoji board (spec §2.7)
// ---------------------------------------------------------------------------

const STATE_EMOJI: Record<WordleLetterState, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬛',
}

/** Emoji rows (one per guess) so the result can be shared without revealing the word. */
export function wordleEmojiGrid(guesses: readonly string[], target: string): string {
  return guesses
    .map((guess) =>
      gradeWordleGuess(guess, target)
        .map((s) => STATE_EMOJI[s])
        .join('')
    )
    .join('\n')
}
