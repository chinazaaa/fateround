import type {
  WordSearchDifficulty,
  WordSearchDirection,
  WordSearchFound,
  WordSearchMetadata,
  WordSearchPlacement,
} from './types'

// Client-safe word-search logic ported from web `src/lib/word-search.ts`. This mirrors the
// same pure/DB boundary as `crossword.ts`: interfaces + constants + pure helpers only.
// Puzzle generation, round-row building, and any Supabase/DB work stay web-only.

export type { WordSearchDifficulty, WordSearchDirection, WordSearchFound, WordSearchMetadata, WordSearchPlacement }

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so a single player can hunt a grid on their own (like Sudoku/Crossword), not
// only in a race with others.
export const WORD_SEARCH_MIN_PLAYERS = 1
export const WORD_SEARCH_MAX_PLAYERS = 20
export const WORD_SEARCH_DEFAULT_MAX_PLAYERS = 20

export const WORD_SEARCH_DEFAULT_DURATION = 600 // 10 minutes
export const WORD_SEARCH_GAME_DURATION_OPTIONS = [0, 120, 180, 300, 600, 900, 1200, 1800] as const

/** Base points for finding a listed word. */
export const WORD_SEARCH_WORD_POINTS = 10
/** Bonus for being the FIRST player to find a given word. */
export const WORD_SEARCH_FIRST_BONUS = 5
/** Per-letter bonus, applied on Hard only (see WORD_SEARCH_DIFFICULTY_SPECS). */
export const WORD_SEARCH_LENGTH_BONUS = 1
/** Penalty applied per "reveal a word" hint used. */
export const WORD_SEARCH_HINT_PENALTY = -10

export const WORD_SEARCH_DIFFICULTIES: WordSearchDifficulty[] = ['easy', 'medium', 'hard']
export const WORD_SEARCH_DEFAULT_DIFFICULTY: WordSearchDifficulty = 'medium'

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

// ── Themes (minimal id/label list mirroring web word-search puzzle themes) ──────

/** Theme options for the create flow; labels must match web word-search themes. */
export const WORD_SEARCH_THEME_OPTIONS: { id: string; label: string }[] = [
  { id: 'general', label: 'General Knowledge' },
  { id: 'animals', label: 'Animals' },
  { id: 'food', label: 'Food & Drink' },
  { id: 'science', label: 'Science' },
]

export const WORD_SEARCH_DEFAULT_THEME = WORD_SEARCH_THEME_OPTIONS[0]!.id

// ── Extra types ─────────────────────────────────────────────────────────────

export interface WordSearchPlayerScore {
  player_id: string
  name: string
  points: number
  wordsFound: number
}

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
  // Dedupe by id: during the finish churn `players` can transiently hold a player twice (a
  // realtime + poll merge race), which would double-count their word points and duplicate their
  // leaderboard row. Count each player once.
  const seenPlayerIds = new Set<string>()
  const activePlayers = players.filter(
    (p) => p.spectator !== true && !seenPlayerIds.has(p.id) && (seenPlayerIds.add(p.id), true)
  )
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

  // Earliest find per (player, word) — a player scores a word once. `nonHintTime` tracks the
  // earliest find that was NOT a reveal, so revealing a word can't steal the speed bonus.
  const wordTime = new Map<string, number>()
  const nonHintTime = new Map<string, number>()
  const lastFound = new Map<string, number>()
  for (const f of found) {
    if (!activeIds.has(f.player_id)) continue
    const key = `${f.player_id}|${f.word}`
    const t = new Date(f.found_at).getTime()
    if (!wordTime.has(key) || t < wordTime.get(key)!) wordTime.set(key, t)
    if (!f.via_hint && (!nonHintTime.has(key) || t < nonHintTime.get(key)!)) nonHintTime.set(key, t)
    if (t > (lastFound.get(f.player_id) ?? -Infinity)) lastFound.set(f.player_id, t)
  }

  for (const word of metadata.words) {
    const foundBy: { playerId: string; time: number }[] = []
    for (const p of activePlayers) {
      const t = wordTime.get(`${p.id}|${word}`)
      if (t !== undefined) foundBy.push({ playerId: p.id, time: t })
    }
    if (foundBy.length === 0) continue
    for (const { playerId } of foundBy) {
      points.set(playerId, (points.get(playerId) ?? 0) + WORD_SEARCH_WORD_POINTS)
      wordsFound.set(playerId, (wordsFound.get(playerId) ?? 0) + 1)
      if (lengthBonus) points.set(playerId, (points.get(playerId) ?? 0) + word.length * WORD_SEARCH_LENGTH_BONUS)
    }
    // Speed bonus goes to the earliest player who found it WITHOUT a hint (if any).
    const nonHintFoundBy = activePlayers
      .map((p) => ({ playerId: p.id, time: nonHintTime.get(`${p.id}|${word}`) }))
      .filter((x): x is { playerId: string; time: number } => x.time !== undefined)
      .sort((a, b) => a.time - b.time)
    if (nonHintFoundBy.length > 0) {
      points.set(nonHintFoundBy[0]!.playerId, (points.get(nonHintFoundBy[0]!.playerId) ?? 0) + WORD_SEARCH_FIRST_BONUS)
    }
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
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wordsFound - a.wordsFound ||
        (lastFound.get(a.player_id) ?? Infinity) - (lastFound.get(b.player_id) ?? Infinity) ||
        a.name.localeCompare(b.name)
    )
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
