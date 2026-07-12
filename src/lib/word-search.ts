import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so a single player can hunt a grid on their own (like Sudoku/Crossword), not
// only in a race with others.
export const WORD_SEARCH_MIN_PLAYERS = 1
export const WORD_SEARCH_MAX_PLAYERS = 20
export const WORD_SEARCH_DEFAULT_MAX_PLAYERS = 20

export const WORD_SEARCH_DEFAULT_DURATION = 600 // 10 minutes
export const WORD_SEARCH_GAME_DURATION_OPTIONS = [0, 300, 600, 900, 1200, 1800] as const

/** Base points for finding a listed word. */
export const WORD_SEARCH_WORD_POINTS = 10
/** Bonus for being the FIRST player to find a given word. */
export const WORD_SEARCH_FIRST_BONUS = 5
/** Per-letter bonus, applied on Hard only (see WORD_SEARCH_DIFFICULTY_SPECS). */
export const WORD_SEARCH_LENGTH_BONUS = 1
/** Penalty applied per "reveal a word" hint used. */
export const WORD_SEARCH_HINT_PENALTY = -2

export type WordSearchDifficulty = 'easy' | 'medium' | 'hard'
export const WORD_SEARCH_DIFFICULTIES: WordSearchDifficulty[] = ['easy', 'medium', 'hard']
export const WORD_SEARCH_DEFAULT_DIFFICULTY: WordSearchDifficulty = 'medium'

// ── Types ──────────────────────────────────────────────────────────────────────

/** The 8 compass directions a word can run. Difficulty picks a subset. */
export type WordSearchDirection = 'E' | 'W' | 'S' | 'N' | 'SE' | 'SW' | 'NE' | 'NW'

/** Row/col step for each direction (row grows downward). */
export const WORD_SEARCH_DIRECTION_VECTORS: Record<WordSearchDirection, [number, number]> = {
  E: [0, 1],
  W: [0, -1],
  S: [1, 0],
  N: [-1, 0],
  SE: [1, 1],
  SW: [1, -1],
  NE: [-1, 1],
  NW: [-1, -1],
}

/** Grid size, word count, allowed directions + length-bonus per difficulty. */
export const WORD_SEARCH_DIFFICULTY_SPECS: Record<
  WordSearchDifficulty,
  { size: number; targetWords: number; directions: WordSearchDirection[]; lengthBonus: boolean }
> = {
  // Easy: horizontal/vertical, forwards only.
  easy: { size: 8, targetWords: 6, directions: ['E', 'S'], lengthBonus: false },
  // Medium: adds the two forward diagonals.
  medium: { size: 12, targetWords: 10, directions: ['E', 'S', 'SE', 'NE'], lengthBonus: false },
  // Hard: all 8, including reversed — and a per-letter length bonus.
  hard: { size: 15, targetWords: 14, directions: ['E', 'W', 'S', 'N', 'SE', 'SW', 'NE', 'NW'], lengthBonus: true },
}

/**
 * Client-readable puzzle description stored on `rounds.word_search_metadata`. The letter
 * grid is fully public (that is the game). What stays server-side is where each word sits
 * — the `WordSearchPlacement[]` solution written to the RLS-protected word_search_solutions
 * table (used to validate finds and power the reveal hint).
 */
export interface WordSearchMetadata {
  size: number
  /** The full letter grid, row-major, all cells filled. */
  grid: string[][]
  /** The word list to hunt for (uppercased, A–Z). */
  words: string[]
  /** Directions words may run in this puzzle (from the difficulty). */
  directions: WordSearchDirection[]
  theme?: string
  difficulty?: WordSearchDifficulty
}

/** Where a planted word starts and which way it runs (server-side solution). */
export interface WordSearchPlacement {
  word: string
  row: number
  col: number
  direction: WordSearchDirection
}

export interface WordSearchFound {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word: string
  start_row: number
  start_col: number
  end_row: number
  end_col: number
  via_hint: boolean
  found_at: string
}

export interface WordSearchPlayerScore {
  player_id: string
  name: string
  points: number
  wordsFound: number
}

export interface WordSearchEntryInput {
  word: string
}

// ── Deterministic RNG (seeded, matches the Crossword/Sudoku generator style) ─────

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

function normalizeWord(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// ── Geometry ─────────────────────────────────────────────────────────────────

/** The [row, col] cells a placement covers, in reading order. */
export function placementCells(p: Pick<WordSearchPlacement, 'row' | 'col' | 'direction' | 'word'>): [number, number][] {
  const [dr, dc] = WORD_SEARCH_DIRECTION_VECTORS[p.direction]
  const cells: [number, number][] = []
  for (let i = 0; i < p.word.length; i++) cells.push([p.row + i * dr, p.col + i * dc])
  return cells
}

/** The last cell of a placement. */
export function placementEnd(p: Pick<WordSearchPlacement, 'row' | 'col' | 'direction' | 'word'>): [number, number] {
  const [dr, dc] = WORD_SEARCH_DIRECTION_VECTORS[p.direction]
  return [p.row + (p.word.length - 1) * dr, p.col + (p.word.length - 1) * dc]
}

/**
 * The straight line of cells between two endpoints, or null if they don't form a valid
 * horizontal / vertical / 45° diagonal run.
 */
export function selectionCells(start: [number, number], end: [number, number]): [number, number][] | null {
  const [r0, c0] = start
  const [r1, c1] = end
  const dr = Math.sign(r1 - r0)
  const dc = Math.sign(c1 - c0)
  const rowSpan = Math.abs(r1 - r0)
  const colSpan = Math.abs(c1 - c0)
  // Must be horizontal, vertical, or a 45° diagonal.
  if (rowSpan !== 0 && colSpan !== 0 && rowSpan !== colSpan) return null
  const length = Math.max(rowSpan, colSpan) + 1
  const cells: [number, number][] = []
  for (let i = 0; i < length; i++) cells.push([r0 + i * dr, c0 + i * dc])
  return cells
}

/**
 * Find the planted word a start→end drag selects, matching endpoints in either drag
 * direction. Returns the placement (with its canonical word) or null.
 */
export function matchSelectionToPlacement(
  placements: WordSearchPlacement[],
  start: [number, number],
  end: [number, number]
): WordSearchPlacement | null {
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]
  for (const p of placements) {
    const pStart: [number, number] = [p.row, p.col]
    const pEnd = placementEnd(p)
    if ((same(start, pStart) && same(end, pEnd)) || (same(start, pEnd) && same(end, pStart))) return p
  }
  return null
}

// ── Puzzle generation ────────────────────────────────────────────────────────

/** Can `word` be laid at (row,col) heading `direction` — in bounds, cells empty or matching? */
function fits(
  grid: string[][],
  size: number,
  word: string,
  row: number,
  col: number,
  direction: WordSearchDirection
): boolean {
  const [dr, dc] = WORD_SEARCH_DIRECTION_VECTORS[direction]
  for (let i = 0; i < word.length; i++) {
    const r = row + i * dr
    const c = col + i * dc
    if (r < 0 || r >= size || c < 0 || c >= size) return false
    const existing = grid[r][c]
    if (existing !== '' && existing !== word[i]) return false
  }
  return true
}

function applyPlacement(grid: string[][], p: WordSearchPlacement) {
  const cells = placementCells(p)
  for (let i = 0; i < cells.length; i++) {
    const [r, c] = cells[i]
    grid[r][c] = p.word[i]
  }
}

/**
 * Plant `words` into a size×size grid running in `directions` (deterministic per seed), then
 * fill the gaps with random letters. Longest words first, random legal spot each. Returns
 * null if fewer than `minWords` could be placed.
 */
export function generateWordSearch(
  words: string[],
  opts: { size: number; seed: number; targetWords?: number; directions: WordSearchDirection[]; minWords?: number }
): { metadata: WordSearchMetadata; solution: WordSearchPlacement[] } | null {
  const { size, seed, directions } = opts
  const minWords = opts.minWords ?? 3
  const rng = xorshift(seed)

  const seen = new Set<string>()
  const pool = words
    .map(normalizeWord)
    .filter((w) => w.length >= 2 && w.length <= size)
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true)))

  if (pool.length === 0) return null

  const ordered = shuffle(pool, rng).sort((a, b) => b.length - a.length)
  const targetWords = Math.min(opts.targetWords ?? ordered.length, ordered.length)

  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''))
  const solution: WordSearchPlacement[] = []

  for (const word of ordered) {
    if (solution.length >= targetWords) break
    // Gather every legal spot, then pick one at random for per-seed variety.
    const spots: WordSearchPlacement[] = []
    for (const direction of directions) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (fits(grid, size, word, row, col, direction)) spots.push({ word, row, col, direction })
        }
      }
    }
    if (spots.length === 0) continue
    const choice = shuffle(spots, rng)[0]
    applyPlacement(grid, choice)
    solution.push(choice)
  }

  if (solution.length < minWords) return null

  // Fill the remaining blanks with random letters.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') grid[r][c] = ALPHABET[Math.floor(rng() * 26)]
    }
  }

  return {
    metadata: { size, grid, words: solution.map((p) => p.word), directions },
    solution,
  }
}

// ── Metadata parsing ───────────────────────────────────────────────────────────

export function parseWordSearchMetadata(raw: unknown): WordSearchMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.size !== 'number' || !Array.isArray(m.grid) || !Array.isArray(m.words)) return null
  return m as unknown as WordSearchMetadata
}

export function parseWordSearchDifficulty(raw: unknown): WordSearchDifficulty {
  return WORD_SEARCH_DIFFICULTIES.includes(raw as WordSearchDifficulty)
    ? (raw as WordSearchDifficulty)
    : WORD_SEARCH_DEFAULT_DIFFICULTY
}

// ── Progress helpers ───────────────────────────────────────────────────────────

type FoundRow = Pick<WordSearchFound, 'player_id' | 'word'>

/** The set of words a player has found. */
export function playerFoundWords(found: FoundRow[], playerId: string): Set<string> {
  const set = new Set<string>()
  for (const f of found) if (f.player_id === playerId) set.add(f.word)
  return set
}

export function wordSearchCompletionPercent(metadata: WordSearchMetadata, found: FoundRow[], playerId: string): number {
  const total = metadata.words.length
  if (total === 0) return 100
  return Math.round((playerFoundWords(found, playerId).size / total) * 100)
}

/** Race win condition: a player has found every listed word. */
export function isWordSearchCompleteForPlayer(
  metadata: WordSearchMetadata,
  found: FoundRow[],
  playerId: string
): boolean {
  return playerFoundWords(found, playerId).size >= metadata.words.length
}

type FoundCellRow = Pick<
  WordSearchFound,
  'player_id' | 'word' | 'start_row' | 'start_col' | 'end_row' | 'end_col' | 'found_at'
>

/** Boolean grid of the cells a given player has found (any of their words covers). */
export function buildPlayerFoundCells(
  metadata: WordSearchMetadata,
  found: FoundCellRow[],
  playerId: string
): boolean[][] {
  const grid = Array.from({ length: metadata.size }, () => Array(metadata.size).fill(false))
  for (const f of found) {
    if (f.player_id !== playerId) continue
    const cells = selectionCells([f.start_row, f.start_col], [f.end_row, f.end_col])
    if (cells) for (const [r, c] of cells) if (grid[r]?.[c] !== undefined) grid[r][c] = true
  }
  return grid
}

/** First finder per cell (earliest found wins), for board ownership colouring. */
export type CellOwnerGrid = (string | null)[][]

export function buildFoundOwnerGrid(metadata: WordSearchMetadata, found: FoundCellRow[]): CellOwnerGrid {
  const owners: CellOwnerGrid = Array.from({ length: metadata.size }, () => Array(metadata.size).fill(null))
  const sorted = [...found].sort((a, b) => new Date(a.found_at).getTime() - new Date(b.found_at).getTime())
  for (const f of sorted) {
    const cells = selectionCells([f.start_row, f.start_col], [f.end_row, f.end_col])
    if (!cells) continue
    for (const [r, c] of cells) if (owners[r]?.[c] === null) owners[r][c] = f.player_id
  }
  return owners
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * +WORD_SEARCH_WORD_POINTS per word found, +WORD_SEARCH_FIRST_BONUS to whoever found each
 * word first, +WORD_SEARCH_LENGTH_BONUS per letter when `lengthBonus` is on (Hard), minus
 * WORD_SEARCH_HINT_PENALTY for each reveal hint used.
 */
export function tallyWordSearchScores(
  metadata: WordSearchMetadata,
  found: Pick<WordSearchFound, 'player_id' | 'word' | 'via_hint' | 'found_at'>[],
  players: { id: string; name: string; spectator?: boolean | null }[],
  opts?: { lengthBonus?: boolean }
): WordSearchPlayerScore[] {
  const lengthBonus =
    opts?.lengthBonus ?? WORD_SEARCH_DIFFICULTY_SPECS[parseWordSearchDifficulty(metadata.difficulty)].lengthBonus
  const activePlayers = players.filter((p) => p.spectator !== true)
  const activeIds = new Set(activePlayers.map((p) => p.id))

  const points = new Map<string, number>()
  const wordsFound = new Map<string, number>()
  const hints = new Map<string, number>()
  for (const p of activePlayers) {
    points.set(p.id, 0)
    wordsFound.set(p.id, 0)
    hints.set(p.id, 0)
  }

  for (const f of found) {
    if (f.via_hint && activeIds.has(f.player_id)) hints.set(f.player_id, (hints.get(f.player_id) ?? 0) + 1)
  }

  // Earliest find per (player, word) — a player scores a word once.
  const wordTime = new Map<string, number>()
  for (const f of found) {
    if (!activeIds.has(f.player_id)) continue
    const key = `${f.player_id}|${f.word}`
    const t = new Date(f.found_at).getTime()
    if (!wordTime.has(key) || t < wordTime.get(key)!) wordTime.set(key, t)
  }

  for (const word of metadata.words) {
    const foundBy: { playerId: string; time: number }[] = []
    for (const p of activePlayers) {
      const t = wordTime.get(`${p.id}|${word}`)
      if (t !== undefined) foundBy.push({ playerId: p.id, time: t })
    }
    if (foundBy.length === 0) continue
    foundBy.sort((a, b) => a.time - b.time)
    const firstId = foundBy[0].playerId
    for (const { playerId } of foundBy) {
      points.set(playerId, (points.get(playerId) ?? 0) + WORD_SEARCH_WORD_POINTS)
      wordsFound.set(playerId, (wordsFound.get(playerId) ?? 0) + 1)
      if (lengthBonus) points.set(playerId, (points.get(playerId) ?? 0) + word.length * WORD_SEARCH_LENGTH_BONUS)
    }
    points.set(firstId, (points.get(firstId) ?? 0) + WORD_SEARCH_FIRST_BONUS)
  }

  for (const p of activePlayers) {
    points.set(p.id, (points.get(p.id) ?? 0) + (hints.get(p.id) ?? 0) * WORD_SEARCH_HINT_PENALTY)
  }

  return activePlayers
    .map((p) => ({
      player_id: p.id,
      name: p.name,
      points: points.get(p.id) ?? 0,
      wordsFound: wordsFound.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.wordsFound - a.wordsFound || a.name.localeCompare(b.name))
}

// ── Duration / timer ─────────────────────────────────────────────────────────

export function clampWordSearchGameDuration(seconds: number): number {
  const n = Number.isFinite(seconds) ? Math.round(seconds) : WORD_SEARCH_DEFAULT_DURATION
  return WORD_SEARCH_GAME_DURATION_OPTIONS.reduce((best, option) =>
    Math.abs(option - n) < Math.abs(best - n) ? option : best
  )
}

export function formatWordSearchGameDuration(seconds: number): string {
  if (!seconds) return 'No limit'
  const minutes = Math.round(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function wordSearchGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return Date.now() - new Date(sessionStartedAt).getTime() >= durationSeconds * 1000
}

// ── Session data ───────────────────────────────────────────────────────────────

/**
 * Build the round row (public metadata: grid + word list, NO placements) plus the
 * placement solution to be written separately to the RLS-protected word_search_solutions
 * table.
 */
export function buildWordSearchRoundRow(gameId: string, metadata: WordSearchMetadata, solution: WordSearchPlacement[]) {
  return {
    roundRow: {
      game_id: gameId,
      round_number: 1,
      status: 'active' as const,
      started_at: new Date().toISOString(),
      participant_ids: [] as string[],
      word_search_metadata: metadata,
    },
    solution,
  }
}

export async function clearWordSearchSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['word_search_found'])
}
