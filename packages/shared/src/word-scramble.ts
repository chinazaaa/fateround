// Client-safe Word Scramble logic, ported from web `src/lib/word-scramble.ts` (pure only —
// the server-only play-again clearer stays web-side). Kept in lockstep with the web copy.

import type { WordScrambleDifficulty, WordScrambleMetadata } from './types'
export type { WordScrambleDifficulty, WordScrambleMetadata }

export const WORD_SCRAMBLE_MIN_PLAYERS = 1
export const WORD_SCRAMBLE_MAX_PLAYERS = 20
export const WORD_SCRAMBLE_DEFAULT_MAX_PLAYERS = 20

export const WORD_SCRAMBLE_DEFAULT_DURATION = 300
export const WORD_SCRAMBLE_GAME_DURATION_OPTIONS = [0, 120, 180, 300, 600, 900] as const

export const WORD_SCRAMBLE_WORD_POINTS = 10
export const WORD_SCRAMBLE_FIRST_BONUS = 5
export const WORD_SCRAMBLE_LENGTH_BONUS = 1
export const WORD_SCRAMBLE_HINT_PENALTY = -2
export const WORD_SCRAMBLE_CLUE_PENALTY = -1

export const WORD_SCRAMBLE_DIFFICULTIES: WordScrambleDifficulty[] = ['easy', 'medium', 'hard']
export const WORD_SCRAMBLE_DEFAULT_DIFFICULTY: WordScrambleDifficulty = 'medium'

export const WORD_SCRAMBLE_DIFFICULTY_SPECS: Record<
  WordScrambleDifficulty,
  { minLen: number; maxLen: number; count: number; lengthBonus: boolean }
> = {
  easy: { minLen: 4, maxLen: 5, count: 8, lengthBonus: false },
  medium: { minLen: 5, maxLen: 7, count: 10, lengthBonus: false },
  hard: { minLen: 7, maxLen: 12, count: 12, lengthBonus: true },
}

export interface WordScramblePlayerScore {
  player_id: string
  name: string
  points: number
  solved: number
}

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

/** A per-word clue-hint row from word_scramble_hints (letters = 1 when a clue was spent; never answer text). */
export interface WordScrambleHint {
  player_id: string
  scramble_index: number
  letters: number
}

export function normalizeScrambleWord(word: string): string {
  return word
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .trim()
}

export function guessMatchesAnswer(guess: string, answer: string): boolean {
  return normalizeScrambleWord(guess) === normalizeScrambleWord(answer)
}

// ── The themes label list (mirrors web word-scramble-puzzles) for the create picker. ──
export const WORD_SCRAMBLE_THEME_OPTIONS: { id: string; label: string }[] = [
  { id: 'general', label: 'General Knowledge' },
  { id: 'animals', label: 'Animals' },
  { id: 'food', label: 'Food & Drink' },
  { id: 'science', label: 'Science' },
]
export const WORD_SCRAMBLE_DEFAULT_THEME = WORD_SCRAMBLE_THEME_OPTIONS[0]!.id

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

export function playerCurrentIndex(metadata: WordScrambleMetadata, solves: SolveRow[], playerId: string): number {
  const solved = playerSolvedIndices(solves, playerId)
  for (let i = 0; i < metadata.count; i += 1) if (!solved.has(i)) return i
  return metadata.count
}

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

  const bestByPlayerIndex = new Map<string, { time: number; word: string; viaHint: boolean }>()
  for (const s of solves) {
    if (!activeIds.has(s.player_id)) continue
    const key = `${s.player_id}|${s.scramble_index}`
    const t = new Date(s.solved_at).getTime()
    const cur = bestByPlayerIndex.get(key)
    if (!cur || t < cur.time) bestByPlayerIndex.set(key, { time: t, word: s.word, viaHint: s.via_hint })
    if (t > (lastSolve.get(s.player_id) ?? -Infinity)) lastSolve.set(s.player_id, t)
  }

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

  // Subtract the clue-hint penalty for each word where the player spent a "Clue" hint.
  for (const h of opts?.hints ?? []) {
    if (!activeIds.has(h.player_id) || h.letters <= 0) continue
    points.set(h.player_id, (points.get(h.player_id) ?? 0) + h.letters * WORD_SCRAMBLE_CLUE_PENALTY)
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
