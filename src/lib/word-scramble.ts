// Word Scramble — a race where everyone gets the same jumbled words and types the
// unscrambled answer. Mirrors the Word Search shape: the jumbled letters + theme live in the
// client-readable rounds.word_scramble_metadata; the ANSWERS live only in the RLS-protected
// word_scramble_solutions table (validated server-side). Each correct unscramble is one row in
// word_scramble_solves (the live race feed). Pure logic + one server-only play-again clearer.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'

export type WordScrambleDifficulty = 'easy' | 'medium' | 'hard'

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so a single player can play solo (like the other puzzle games), not only in a race.
export const WORD_SCRAMBLE_MIN_PLAYERS = 1
export const WORD_SCRAMBLE_MAX_PLAYERS = 20
export const WORD_SCRAMBLE_DEFAULT_MAX_PLAYERS = 20

export const WORD_SCRAMBLE_DEFAULT_DURATION = 300 // 5 minutes
export const WORD_SCRAMBLE_GAME_DURATION_OPTIONS = [0, 120, 180, 300, 600, 900] as const

/** Base points for a correct unscramble. */
export const WORD_SCRAMBLE_WORD_POINTS = 10
/** Bonus for being the FIRST player to solve a given scramble. */
export const WORD_SCRAMBLE_FIRST_BONUS = 5
/** Per-letter bonus, applied on Hard only. */
export const WORD_SCRAMBLE_LENGTH_BONUS = 1
/** Penalty for the full "Reveal answer" (shows the whole word and locks in the solve). */
export const WORD_SCRAMBLE_HINT_PENALTY = -2
/** Penalty per single letter revealed via the "Hint" button (before solving). */
export const WORD_SCRAMBLE_LETTER_HINT_PENALTY = -1

export const WORD_SCRAMBLE_DIFFICULTIES: WordScrambleDifficulty[] = ['easy', 'medium', 'hard']
export const WORD_SCRAMBLE_DEFAULT_DIFFICULTY: WordScrambleDifficulty = 'medium'

/** Word-length window, how many scrambles a round has, and the length bonus, per difficulty. */
export const WORD_SCRAMBLE_DIFFICULTY_SPECS: Record<
  WordScrambleDifficulty,
  { minLen: number; maxLen: number; count: number; lengthBonus: boolean }
> = {
  easy: { minLen: 4, maxLen: 5, count: 8, lengthBonus: false },
  medium: { minLen: 5, maxLen: 7, count: 10, lengthBonus: false },
  hard: { minLen: 7, maxLen: 12, count: 12, lengthBonus: true },
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Public per-round data: the jumbled words (in order) + optional per-word hint. The ANSWERS
 * are never here — they live in word_scramble_solutions and are validated server-side.
 */
export interface WordScrambleMetadata {
  scrambles: string[]
  count: number
  theme?: string
  difficulty?: WordScrambleDifficulty
  /** Optional theme hint per scramble (index-aligned), shown as a gentle nudge. */
  hints?: string[]
}

/** A custom-pool row: the answer word + an optional hint. */
export interface WordScrambleEntryInput {
  word: string
  hint?: string
}

export interface WordScramblePlayerScore {
  player_id: string
  name: string
  points: number
  solved: number
}

/** A solve row from the live race feed (word_scramble_solves). */
export interface WordScrambleSolve {
  id: string
  game_id: string
  round_id: string
  player_id: string
  scramble_index: number
  word: string
  via_hint: boolean
  solved_at: string
}

type SolveRow = Pick<WordScrambleSolve, 'player_id' | 'scramble_index' | 'word' | 'via_hint' | 'solved_at'>

/** A per-word letter-hint tally row from word_scramble_hints (letters revealed, never text). */
export interface WordScrambleHint {
  player_id: string
  scramble_index: number
  letters: number
}

// ── Scrambling ──────────────────────────────────────────────────────────────

/** Deterministic PRNG (xorshift32) so a given seed always yields the same scramble. */
export function xorshift(seed: number): () => number {
  let x = seed || 0x9e3779b9
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return ((x >>> 0) % 100000) / 100000
  }
}

export function normalizeScrambleWord(word: string): string {
  return word
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .trim()
}

/**
 * Shuffle a word's letters into a different arrangement than the original (best effort — a
 * word whose letters are all identical can't be re-arranged, so it is returned as-is).
 */
export function scrambleWord(word: string, rng: () => number): string {
  const letters = normalizeScrambleWord(word).split('')
  if (letters.length < 2) return letters.join('')
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // Fisher–Yates with the seeded rng.
    const shuffled = [...letters]
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    if (shuffled.join('') !== letters.join('')) return shuffled.join('')
  }
  // All permutations tried collided (e.g. a palindromic letter set) — reverse as a fallback.
  const reversed = [...letters].reverse().join('')
  return reversed === letters.join('') ? letters.join('') : reversed
}

// ── Guess matching ────────────────────────────────────────────────────────────

/** A guess matches an answer up to case/spacing/punctuation. */
export function guessMatchesAnswer(guess: string, answer: string): boolean {
  return normalizeScrambleWord(guess) === normalizeScrambleWord(answer)
}

// ── Metadata parsing ────────────────────────────────────────────────────────────

export function parseWordScrambleMetadata(raw: unknown): WordScrambleMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!Array.isArray(m.scrambles) || typeof m.count !== 'number') return null
  return m as unknown as WordScrambleMetadata
}

export function parseWordScrambleDifficulty(raw: unknown): WordScrambleDifficulty {
  return WORD_SCRAMBLE_DIFFICULTIES.includes(raw as WordScrambleDifficulty)
    ? (raw as WordScrambleDifficulty)
    : WORD_SCRAMBLE_DEFAULT_DIFFICULTY
}

// ── Progress helpers ───────────────────────────────────────────────────────────

/** The set of scramble indices a player has solved. */
export function playerSolvedIndices(solves: SolveRow[], playerId: string): Set<number> {
  const set = new Set<number>()
  for (const s of solves) if (s.player_id === playerId) set.add(s.scramble_index)
  return set
}

export function wordScrambleCompletionPercent(
  metadata: WordScrambleMetadata,
  solves: SolveRow[],
  playerId: string
): number {
  const total = metadata.count
  if (total === 0) return 100
  return Math.round((playerSolvedIndices(solves, playerId).size / total) * 100)
}

/** The lowest scramble index a player has NOT yet solved (their current scramble), or count. */
export function playerCurrentIndex(metadata: WordScrambleMetadata, solves: SolveRow[], playerId: string): number {
  const solved = playerSolvedIndices(solves, playerId)
  for (let i = 0; i < metadata.count; i += 1) if (!solved.has(i)) return i
  return metadata.count
}

/** Race win condition: a player has solved every scramble. */
export function isWordScrambleCompleteForPlayer(
  metadata: WordScrambleMetadata,
  solves: SolveRow[],
  playerId: string
): boolean {
  return playerSolvedIndices(solves, playerId).size >= metadata.count
}

// ── Scoring ─────────────────────────────────────────────────────────────────────

/**
 * +WORD_POINTS per solved scramble, +FIRST_BONUS to the earliest NON-hint solver of each
 * scramble, an optional per-letter length bonus (Hard), minus the hint penalty per reveal.
 * Ties break on points → solved → finish time (earliest last solve) → name.
 */
export function tallyWordScrambleScores(
  metadata: WordScrambleMetadata,
  solves: SolveRow[],
  players: { id: string; name: string; spectator?: boolean | null }[],
  opts?: { lengthBonus?: boolean; hints?: WordScrambleHint[] }
): WordScramblePlayerScore[] {
  const lengthBonus =
    opts?.lengthBonus ?? WORD_SCRAMBLE_DIFFICULTY_SPECS[parseWordScrambleDifficulty(metadata.difficulty)].lengthBonus
  const activePlayers = players.filter((p) => p.spectator !== true)
  const activeIds = new Set(activePlayers.map((p) => p.id))

  const points = new Map<string, number>()
  const solved = new Map<string, number>()
  const lastSolve = new Map<string, number>()
  for (const p of activePlayers) {
    points.set(p.id, 0)
    solved.set(p.id, 0)
  }

  // Earliest solve per (player, index); track the earliest NON-hint solve per index for the
  // first-solver bonus, and each player's latest solve time for the tiebreak.
  const bestByPlayerIndex = new Map<string, { time: number; word: string; viaHint: boolean }>()
  for (const s of solves) {
    if (!activeIds.has(s.player_id)) continue
    const key = `${s.player_id}|${s.scramble_index}`
    const t = new Date(s.solved_at).getTime()
    const cur = bestByPlayerIndex.get(key)
    if (!cur || t < cur.time) bestByPlayerIndex.set(key, { time: t, word: s.word, viaHint: s.via_hint })
    if (t > (lastSolve.get(s.player_id) ?? -Infinity)) lastSolve.set(s.player_id, t)
  }

  // Per-index: award base + length bonus to every solver, and the first bonus to the earliest
  // non-hint solver.
  for (let index = 0; index < metadata.count; index += 1) {
    const nonHint: { playerId: string; time: number }[] = []
    for (const p of activePlayers) {
      const entry = bestByPlayerIndex.get(`${p.id}|${index}`)
      if (!entry) continue
      points.set(p.id, (points.get(p.id) ?? 0) + WORD_SCRAMBLE_WORD_POINTS)
      solved.set(p.id, (solved.get(p.id) ?? 0) + 1)
      if (lengthBonus) points.set(p.id, (points.get(p.id) ?? 0) + entry.word.length * WORD_SCRAMBLE_LENGTH_BONUS)
      if (entry.viaHint) points.set(p.id, (points.get(p.id) ?? 0) + WORD_SCRAMBLE_HINT_PENALTY)
      else nonHint.push({ playerId: p.id, time: entry.time })
    }
    nonHint.sort((a, b) => a.time - b.time)
    if (nonHint.length > 0)
      points.set(nonHint[0].playerId, (points.get(nonHint[0].playerId) ?? 0) + WORD_SCRAMBLE_FIRST_BONUS)
  }

  // Subtract the per-letter penalty for every letter revealed via the "Hint" button.
  for (const h of opts?.hints ?? []) {
    if (!activeIds.has(h.player_id) || h.letters <= 0) continue
    points.set(h.player_id, (points.get(h.player_id) ?? 0) + h.letters * WORD_SCRAMBLE_LETTER_HINT_PENALTY)
  }

  return activePlayers
    .map((p) => ({
      player_id: p.id,
      name: p.name,
      points: points.get(p.id) ?? 0,
      solved: solved.get(p.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.solved - a.solved ||
        (lastSolve.get(a.player_id) ?? Infinity) - (lastSolve.get(b.player_id) ?? Infinity) ||
        a.name.localeCompare(b.name)
    )
}

// ── Round row ───────────────────────────────────────────────────────────────────

/** Build the rounds insert row (metadata is public; answers are inserted separately). */
export function buildWordScrambleRoundRow(gameId: string, metadata: WordScrambleMetadata) {
  return {
    game_id: gameId,
    round_number: 1,
    status: 'active' as const,
    participant_ids: [] as string[],
    word_scramble_metadata: metadata,
  }
}

/** How long the session has run vs its limit (0/no limit → never expires). */
export function wordScrambleGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return Date.now() - new Date(sessionStartedAt).getTime() >= durationSeconds * 1000
}

export function clampWordScrambleGameDuration(seconds: number): number {
  const n = Number.isFinite(seconds) ? Math.round(seconds) : WORD_SCRAMBLE_DEFAULT_DURATION
  return WORD_SCRAMBLE_GAME_DURATION_OPTIONS.reduce((best, option) =>
    Math.abs(option - n) < Math.abs(best - n) ? option : best
  )
}

export function formatWordScrambleGameDuration(seconds: number): string {
  if (!seconds) return 'No limit'
  const minutes = Math.round(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

// ── Play-again cleanup ────────────────────────────────────────────────────────────

/** Wipe a room's scramble solves before a replay (solutions cascade with the round). */
export async function clearWordScrambleSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['word_scramble_solves'])
}
