import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { msUntilDeadline, secondsUntilDeadline } from '@/lib/round-timing'
import type { Game } from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

export const WORD_HUNT_MIN_PLAYERS = 2
export const WORD_HUNT_MAX_PLAYERS = 20
export const WORD_HUNT_DEFAULT_MAX_PLAYERS = 20
export const WORD_HUNT_DEFAULT_TIMER = 180
export const WORD_HUNT_TIMER_OPTIONS = [60, 120, 180, 300] as const
export const WORD_HUNT_MIN_WORD_LENGTH = 3
export const WORD_HUNT_GRID_SIZE = 4
/** At least this many cells must contain a vowel (A/E/I/O/U) — avoids all-consonant boards. */
export const WORD_HUNT_MIN_VOWEL_CELLS = 5
/** Regenerate grids with fewer playable words than this (checked at round start). */
export const WORD_HUNT_MIN_VALID_WORDS = 40

const WORD_HUNT_VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

/** Classic 16 Boggle dice (one letter shown per die). */
const BOGGLE_DICE = [
  'AAEEGN',
  'ABBJOO',
  'ACHOPS',
  'AFFKPS',
  'AOOTTW',
  'CIMOTU',
  'DEILRX',
  'DELRVY',
  'DISTTY',
  'EEGHNW',
  'EEINSU',
  'EHRTVW',
  'EIOSST',
  'ELRTTY',
  'HIMNQU',
  'HLNNRZ',
] as const

// ── Types ────────────────────────────────────────────────────────────────────

export interface WordHuntMetadata {
  grid: string[][] // 4×4 uppercase letters
  /** Precomputed valid words for this grid — instant client checks, fast server lookup */
  valid_words?: string[]
}

export interface WordHuntSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word: string
  path: number[]
  points_awarded: number
  submitted_at: string
}

export interface WordHuntPlayerScore {
  player_id: string
  name: string
  points: number
  word_count: number
}

// ── Grid generation ──────────────────────────────────────────────────────────

function xorshift(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function cellHasVowel(letter: string): boolean {
  for (const ch of letter.toUpperCase()) {
    if (WORD_HUNT_VOWELS.has(ch)) return true
  }
  return false
}

export function countVowelCells(grid: string[][]): number {
  return grid.flat().filter(cellHasVowel).length
}

function rollWordHuntGrid(seed: number): string[][] {
  const rng = xorshift(seed)
  const dice = shuffle([...BOGGLE_DICE], rng)
  const grid: string[][] = []
  for (let row = 0; row < WORD_HUNT_GRID_SIZE; row++) {
    const rowLetters: string[] = []
    for (let col = 0; col < WORD_HUNT_GRID_SIZE; col++) {
      const die = dice[row * WORD_HUNT_GRID_SIZE + col]
      const face = die[Math.floor(rng() * die.length)]
      rowLetters.push(face === 'Q' ? 'Qu' : face)
    }
    grid.push(rowLetters)
  }
  return grid
}

export function generateWordHuntGrid(seed: number): string[][] {
  for (let attempt = 0; attempt < 64; attempt++) {
    const grid = rollWordHuntGrid(seed + attempt * 7919)
    if (countVowelCells(grid) >= WORD_HUNT_MIN_VOWEL_CELLS) return grid
  }
  return rollWordHuntGrid(seed)
}

export function parseWordHuntMetadata(raw: unknown): WordHuntMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (!Array.isArray(m.grid)) return null
  return m as unknown as WordHuntMetadata
}

// ── Path helpers ─────────────────────────────────────────────────────────────

export function indexToRowCol(index: number): [number, number] {
  return [Math.floor(index / WORD_HUNT_GRID_SIZE), index % WORD_HUNT_GRID_SIZE]
}

export function rowColToIndex(row: number, col: number): number {
  return row * WORD_HUNT_GRID_SIZE + col
}

function areAdjacent(a: number, b: number): boolean {
  const [ar, ac] = indexToRowCol(a)
  const [br, bc] = indexToRowCol(b)
  return Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1 && !(ar === br && ac === bc)
}

export function letterAt(grid: string[][], index: number): string {
  const [row, col] = indexToRowCol(index)
  return grid[row]?.[col] ?? ''
}

export function wordFromPath(grid: string[][], path: number[]): string {
  return path.map((i) => letterAt(grid, i)).join('').toLowerCase()
}

export function isValidPath(path: number[]): boolean {
  if (path.length < WORD_HUNT_MIN_WORD_LENGTH) return false
  const seen = new Set<number>()
  for (let i = 0; i < path.length; i++) {
    const idx = path[i]
    if (idx < 0 || idx >= WORD_HUNT_GRID_SIZE * WORD_HUNT_GRID_SIZE) return false
    if (seen.has(idx)) return false
    seen.add(idx)
    if (i > 0 && !areAdjacent(path[i - 1], idx)) return false
  }
  return true
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function wordHuntPoints(wordLength: number): number {
  if (wordLength < WORD_HUNT_MIN_WORD_LENGTH) return 0
  if (wordLength === 3) return 100
  if (wordLength === 4) return 400
  if (wordLength === 5) return 800
  return 800 + (wordLength - 5) * 400
}

export interface WordHuntWordEntry {
  word: string
  points: number
  found: boolean
}

export function sortWordHuntSubmissions(
  submissions: Pick<WordHuntSubmission, 'word' | 'points_awarded'>[]
): Pick<WordHuntSubmission, 'word' | 'points_awarded'>[] {
  return [...submissions].sort(
    (a, b) => b.points_awarded - a.points_awarded || a.word.localeCompare(b.word)
  )
}

export function buildWordHuntWordList(
  validWords: string[],
  foundWords: ReadonlySet<string>
): WordHuntWordEntry[] {
  return validWords
    .map((word) => ({
      word,
      points: wordHuntPoints(word.length),
      found: foundWords.has(word),
    }))
    .sort((a, b) => b.points - a.points || a.word.localeCompare(b.word))
}

export function wordHuntDeadlineMs(sessionStartedAt: string | null | undefined, timerSeconds: number): number | null {
  if (!sessionStartedAt) return null
  const seconds = timerSeconds > 0 ? timerSeconds : WORD_HUNT_DEFAULT_TIMER
  return new Date(sessionStartedAt).getTime() + seconds * 1000
}

export function wordHuntTimeRemainingMs(
  sessionStartedAt: string | null | undefined,
  timerSeconds: number,
  now = Date.now()
): number | null {
  const deadline = wordHuntDeadlineMs(sessionStartedAt, timerSeconds)
  if (deadline === null) return null
  return Math.max(0, deadline - now)
}

export function wordHuntTimerSeconds(timerSeconds: number | null | undefined): number {
  return clampWordHuntTimer(timerSeconds)
}

export function clampWordHuntTimer(seconds: unknown): number {
  const n = Number(seconds)
  if ((WORD_HUNT_TIMER_OPTIONS as readonly number[]).includes(n)) return n
  return WORD_HUNT_DEFAULT_TIMER
}

export function formatWordHuntTimer(seconds: number): string {
  if (seconds === 60) return '1 minute'
  if (seconds === 120) return '2 minutes'
  if (seconds === 180) return '3 minutes'
  if (seconds === 300) return '5 minutes'
  return `${seconds}s`
}

/** Client may call expire slightly before the server deadline — allow a small grace window (ms). */
export const WORD_HUNT_EXPIRE_GRACE_MS = 2500

export function wordHuntSessionExpired(
  sessionStartedAt: string | null | undefined,
  timerSeconds: number | null | undefined,
  graceMs = 0
): boolean {
  if (!sessionStartedAt) return false
  return msUntilDeadline(sessionStartedAt, wordHuntTimerSeconds(timerSeconds)) <= graceMs
}

export async function finishExpiredWordHuntGame(
  supabase: SupabaseClient,
  game: Pick<Game, 'id' | 'status' | 'session_started_at' | 'timer_seconds'>,
  options?: { graceMs?: number }
): Promise<boolean> {
  if (game.status === 'finished') return true
  if (game.status !== 'active') return false
  const graceMs = options?.graceMs ?? 0
  if (!wordHuntSessionExpired(game.session_started_at, game.timer_seconds, graceMs)) return false

  const { error } = await markGameFinished(supabase, game.id)
  return !error
}

// ── Session data ─────────────────────────────────────────────────────────────

export function buildWordHuntRoundRow(gameId: string, metadata: WordHuntMetadata) {
  return {
    game_id: gameId,
    round_number: 1,
    status: 'active' as const,
    started_at: new Date().toISOString(),
    participant_ids: [] as string[],
    word_hunt_metadata: metadata,
  }
}

export async function clearWordHuntSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('word_hunt_submissions').delete().eq('game_id', gameId)
  if (error) return { error: error.message }
  return { error: null }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export function tallyWordHuntScores(
  submissions: Pick<WordHuntSubmission, 'player_id' | 'points_awarded'>[],
  players: { id: string; name: string; spectator?: boolean | null }[]
): WordHuntPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const totals = new Map<string, { points: number; word_count: number }>()
  for (const p of activePlayers) totals.set(p.id, { points: 0, word_count: 0 })

  for (const s of submissions) {
    const current = totals.get(s.player_id)
    if (current) {
      current.points += s.points_awarded
      current.word_count += 1
    }
  }

  return activePlayers
    .map((p) => {
      const t = totals.get(p.id) ?? { points: 0, word_count: 0 }
      return { player_id: p.id, name: p.name, points: t.points, word_count: t.word_count }
    })
    .sort((a, b) => b.points - a.points || b.word_count - a.word_count || a.name.localeCompare(b.name))
}
