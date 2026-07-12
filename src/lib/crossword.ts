import type { SupabaseClient } from '@supabase/supabase-js'
import { clearSessionTables } from './session-clear'

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so a single player can solve a crossword on their own (like Sudoku/Yahtzee),
// not only in a race with others.
export const CROSSWORD_MIN_PLAYERS = 1
export const CROSSWORD_MAX_PLAYERS = 20
export const CROSSWORD_DEFAULT_MAX_PLAYERS = 20

export const CROSSWORD_DEFAULT_DURATION = 900 // 15 minutes
export const CROSSWORD_GAME_DURATION_OPTIONS = [0, 120, 180, 300, 600, 900, 1200, 1800] as const

/** Base points for correctly completing a whole word. */
export const CROSSWORD_WORD_POINTS = 10
/** Bonus for being the FIRST player to complete a given word. */
export const CROSSWORD_FIRST_WORD_BONUS = 5
/** Penalty applied per "reveal letter" hint used. */
export const CROSSWORD_HINT_PENALTY = -3

export type CrosswordDifficulty = 'easy' | 'medium' | 'hard'
export const CROSSWORD_DIFFICULTIES: CrosswordDifficulty[] = ['easy', 'medium', 'hard']
export const CROSSWORD_DEFAULT_DIFFICULTY: CrosswordDifficulty = 'medium'

/** Grid size + target word count per difficulty. */
export const CROSSWORD_DIFFICULTY_SPECS: Record<
  CrosswordDifficulty,
  { size: number; targetWords: number; maxWordLength: number }
> = {
  easy: { size: 8, targetWords: 6, maxWordLength: 7 },
  medium: { size: 11, targetWords: 9, maxWordLength: 9 },
  hard: { size: 14, targetWords: 13, maxWordLength: 12 },
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type CrosswordDirection = 'across' | 'down'

/** A single clue: where its first letter sits, which way it runs, its length + text. */
export interface CrosswordClue {
  number: number
  direction: CrosswordDirection
  row: number
  col: number
  length: number
  clue: string
}

/**
 * Client-readable puzzle description stored on `rounds.crossword_metadata`. It carries
 * everything needed to render and play the grid EXCEPT the answer letters — those live
 * in the RLS-protected `crossword_solutions` table (see buildCrosswordRoundRow).
 */
export interface CrosswordMetadata {
  size: number
  /** true = black / unused cell; false = a fillable cell. */
  blocked: boolean[][]
  /** Clue number shown in a cell, or 0 for none. */
  numbers: number[][]
  clues: CrosswordClue[]
  theme?: string
  difficulty?: CrosswordDifficulty
}

export interface CrosswordSubmission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  cell_row: number
  cell_col: number
  submitted_letter: string
  is_correct: boolean
  via_hint: boolean
  submitted_at: string
}

export interface CrosswordPlayerScore {
  player_id: string
  name: string
  points: number
  wordsCompleted: number
}

export interface CrosswordEntryInput {
  answer: string
  clue: string
}

// ── Deterministic RNG (seeded, matches the Sudoku generator style) ──────────────

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

// ── Puzzle generation ───────────────────────────────────────────────────────────

interface Placement {
  answer: string
  clue: string
  row: number
  col: number
  direction: CrosswordDirection
}

function normalizeAnswer(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

/** Cells occupied by a placement, in order. */
function placementCells(p: Pick<Placement, 'row' | 'col' | 'direction' | 'answer'>): [number, number][] {
  const cells: [number, number][] = []
  for (let i = 0; i < p.answer.length; i++) {
    cells.push(p.direction === 'across' ? [p.row, p.col + i] : [p.row + i, p.col])
  }
  return cells
}

/**
 * Try to place `answer` so it crosses at least one existing letter without creating
 * illegal adjacencies (parallel words touching, runs merging). Returns the best-scoring
 * legal placement, or null. `grid` holds placed letters (or '' for empty).
 */
function findPlacement(grid: string[][], size: number, answer: string, rng: () => number): Placement | null {
  const candidates: { placement: Placement; crossings: number }[] = []
  const letters = answer.split('')

  for (let li = 0; li < letters.length; li++) {
    const letter = letters[li]
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] !== letter) continue
        // Two orientations pass through this crossing cell.
        for (const direction of ['across', 'down'] as CrosswordDirection[]) {
          const row = direction === 'across' ? r : r - li
          const col = direction === 'across' ? c - li : c
          const placement: Placement = { answer, clue: '', row, col, direction }
          const crossings = legalPlacementCrossings(grid, size, placement)
          if (crossings >= 1) candidates.push({ placement, crossings })
        }
      }
    }
  }

  if (candidates.length === 0) return null
  // Prefer more crossings (denser grids); break ties randomly for variety per seed.
  const maxCrossings = Math.max(...candidates.map((c) => c.crossings))
  const best = shuffle(
    candidates.filter((c) => c.crossings === maxCrossings),
    rng
  )
  return best[0].placement
}

/**
 * Returns the crossing count if the placement is legal, or -1 if illegal.
 * Legality rules (standard crossword construction):
 *  - stays in bounds
 *  - the cell immediately before the start and after the end (along the run) is empty
 *  - each cell either matches an existing letter (a crossing) or is empty; and empty
 *    cells must not have a perpendicular neighbour already filled (avoids two parallel
 *    words touching side-by-side, which would read as unintended words)
 */
function legalPlacementCrossings(grid: string[][], size: number, p: Placement): number {
  const cells = placementCells(p)
  const [firstR, firstC] = cells[0]
  const [lastR, lastC] = cells[cells.length - 1]

  const inBounds = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size
  if (!inBounds(firstR, firstC) || !inBounds(lastR, lastC)) return -1

  // Guard the caps so we don't extend an existing run.
  const beforeR = p.direction === 'across' ? firstR : firstR - 1
  const beforeC = p.direction === 'across' ? firstC - 1 : firstC
  const afterR = p.direction === 'across' ? lastR : lastR + 1
  const afterC = p.direction === 'across' ? lastC + 1 : lastC
  if (inBounds(beforeR, beforeC) && grid[beforeR][beforeC] !== '') return -1
  if (inBounds(afterR, afterC) && grid[afterR][afterC] !== '') return -1

  let crossings = 0
  for (let i = 0; i < cells.length; i++) {
    const [r, c] = cells[i]
    const existing = grid[r][c]
    if (existing !== '') {
      if (existing !== p.answer[i]) return -1
      crossings++
      continue
    }
    // Empty cell — its perpendicular neighbours must be empty.
    if (p.direction === 'across') {
      if (inBounds(r - 1, c) && grid[r - 1][c] !== '') return -1
      if (inBounds(r + 1, c) && grid[r + 1][c] !== '') return -1
    } else {
      if (inBounds(r, c - 1) && grid[r][c - 1] !== '') return -1
      if (inBounds(r, c + 1) && grid[r][c + 1] !== '') return -1
    }
  }
  return crossings
}

function applyPlacement(grid: string[][], p: Placement) {
  for (const [r, c] of placementCells(p)) {
    grid[r][c] = p.answer[cellIndex(p, r, c)]
  }
}

function cellIndex(p: Placement, r: number, c: number): number {
  return p.direction === 'across' ? c - p.col : r - p.row
}

/**
 * Assign standard crossword numbering to the solution grid and pair each placement with
 * its clue number. A cell is numbered when it starts an across and/or down run.
 */
function numberGrid(
  solution: string[][],
  size: number,
  placements: Placement[]
): { numbers: number[][]; clues: CrosswordClue[] } {
  const filled = (r: number, c: number) => r >= 0 && r < size && c >= 0 && c < size && solution[r][c] !== ''
  const numbers: number[][] = Array.from({ length: size }, () => Array(size).fill(0))
  const startNumberAt = new Map<string, number>()
  let next = 1

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!filled(r, c)) continue
      const startsAcross = !filled(r, c - 1) && filled(r, c + 1)
      const startsDown = !filled(r - 1, c) && filled(r + 1, c)
      if (startsAcross || startsDown) {
        numbers[r][c] = next
        startNumberAt.set(`${r},${c}`, next)
        next++
      }
    }
  }

  const clues: CrosswordClue[] = placements
    .map((p) => ({
      number: startNumberAt.get(`${p.row},${p.col}`) ?? 0,
      direction: p.direction,
      row: p.row,
      col: p.col,
      length: p.answer.length,
      clue: p.clue,
    }))
    .filter((clue) => clue.number > 0)
    .sort((a, b) => a.number - b.number || (a.direction === 'across' ? -1 : 1))

  return { numbers, clues }
}

/**
 * Build a crossword from a pool of answer/clue entries. Greedy construction: place the
 * longest word first, then fit the rest by crossing existing letters. Deterministic for
 * a given `seed`. Returns null if fewer than `minWords` could be placed.
 */
export function generateCrossword(
  entries: CrosswordEntryInput[],
  opts: { size: number; seed: number; targetWords?: number; maxWordLength?: number; minWords?: number }
): { metadata: CrosswordMetadata; solution: string[][] } | null {
  const { size, seed } = opts
  const maxWordLength = opts.maxWordLength ?? size
  const minWords = opts.minWords ?? 4
  const rng = xorshift(seed)

  // Clean, dedupe, keep answers that fit the grid.
  const seen = new Set<string>()
  const pool = entries
    .map((e) => ({ answer: normalizeAnswer(e.answer), clue: e.clue.trim() }))
    .filter((e) => e.answer.length >= 2 && e.answer.length <= Math.min(maxWordLength, size) && e.clue.length > 0)
    .filter((e) => (seen.has(e.answer) ? false : (seen.add(e.answer), true)))

  if (pool.length === 0) return null

  // Longest first, shuffled within equal lengths for seed variety.
  const ordered = shuffle(pool, rng).sort((a, b) => b.answer.length - a.answer.length)
  const targetWords = Math.min(opts.targetWords ?? ordered.length, ordered.length)

  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''))
  const placements: Placement[] = []

  // Seed the grid with the first (longest) word near the centre, horizontally.
  const first = ordered[0]
  const firstRow = Math.floor(size / 2)
  const firstCol = Math.max(0, Math.floor((size - first.answer.length) / 2))
  const firstPlacement: Placement = {
    answer: first.answer,
    clue: first.clue,
    row: firstRow,
    col: firstCol,
    direction: 'across',
  }
  applyPlacement(grid, firstPlacement)
  placements.push(firstPlacement)

  for (const entry of ordered.slice(1)) {
    if (placements.length >= targetWords) break
    const placement = findPlacement(grid, size, entry.answer, rng)
    if (!placement) continue
    placement.clue = entry.clue
    applyPlacement(grid, placement)
    placements.push(placement)
  }

  if (placements.length < minWords) return null

  const blocked: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => grid[r][c] === '')
  )
  const { numbers, clues } = numberGrid(grid, size, placements)

  return {
    metadata: { size, blocked, numbers, clues },
    solution: grid,
  }
}

// ── Metadata parsing ────────────────────────────────────────────────────────────

export function parseCrosswordMetadata(raw: unknown): CrosswordMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.size !== 'number' || !Array.isArray(m.blocked) || !Array.isArray(m.clues)) return null
  return m as unknown as CrosswordMetadata
}

// ── Grid / word helpers ─────────────────────────────────────────────────────────

/** The [row, col] cells covered by a clue's word. */
export function crosswordWordCells(clue: CrosswordClue): [number, number][] {
  const cells: [number, number][] = []
  for (let i = 0; i < clue.length; i++) {
    cells.push(clue.direction === 'across' ? [clue.row, clue.col + i] : [clue.row + i, clue.col])
  }
  return cells
}

/** Total fillable (non-blocked) cells in the grid. */
export function fillableCellCount(metadata: CrosswordMetadata): number {
  let count = 0
  for (let r = 0; r < metadata.size; r++) {
    for (let c = 0; c < metadata.size; c++) {
      if (!metadata.blocked[r]?.[c]) count++
    }
  }
  return count
}

type CellSub = Pick<CrosswordSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>

/** Set of "row-col" keys this player has correctly filled. */
export function playerCorrectCellKeys(submissions: CellSub[], playerId: string): Set<string> {
  const set = new Set<string>()
  for (const s of submissions) {
    if (s.player_id === playerId && s.is_correct) set.add(`${s.cell_row}-${s.cell_col}`)
  }
  return set
}

export function playerHasSolvedCell(submissions: CellSub[], playerId: string, row: number, col: number): boolean {
  return submissions.some((s) => s.player_id === playerId && s.cell_row === row && s.cell_col === col && s.is_correct)
}

/** True when the player has correctly filled every cell of the given word. */
export function playerCompletedWord(submissions: CellSub[], playerId: string, clue: CrosswordClue): boolean {
  return crosswordWordCells(clue).every(([r, c]) => playerHasSolvedCell(submissions, playerId, r, c))
}

export function playerCompletionPercent(metadata: CrosswordMetadata, submissions: CellSub[], playerId: string): number {
  const total = fillableCellCount(metadata)
  if (total === 0) return 100
  const solved = playerCorrectCellKeys(submissions, playerId).size
  return Math.round((solved / total) * 100)
}

/** True when a player has correctly filled the entire grid (Race win condition). */
export function isCrosswordCompleteForPlayer(
  metadata: CrosswordMetadata,
  submissions: CellSub[],
  playerId: string
): boolean {
  return playerCompletionPercent(metadata, submissions, playerId) >= 100
}

/** First correct solver per cell (earliest submission wins), for board colouring. */
export type CellOwnerGrid = (string | null)[][]

export function buildCellOwnerGrid(
  metadata: CrosswordMetadata,
  submissions: Pick<CrosswordSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct' | 'submitted_at'>[]
): CellOwnerGrid {
  const owners: CellOwnerGrid = Array.from({ length: metadata.size }, () => Array(metadata.size).fill(null))
  const sorted = [...submissions]
    .filter((s) => s.is_correct)
    .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
  for (const s of sorted) {
    if (!owners[s.cell_row]?.[s.cell_col]) owners[s.cell_row][s.cell_col] = s.player_id
  }
  return owners
}

export function buildPlayerSolvedGrid(
  metadata: CrosswordMetadata,
  submissions: CellSub[],
  playerId: string
): boolean[][] {
  const grid = Array.from({ length: metadata.size }, () => Array(metadata.size).fill(false))
  for (const s of submissions) {
    if (s.player_id === playerId && s.is_correct) grid[s.cell_row][s.cell_col] = true
  }
  return grid
}

/**
 * Per-player display grid of letters: the player's own correct letters plus local drafts.
 * Other players' letters are never shown (only their ownership colour).
 */
export function buildPlayerLetterGrid(
  metadata: CrosswordMetadata,
  submissions: Pick<CrosswordSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'submitted_letter' | 'is_correct'>[],
  playerId: string,
  localDrafts: string[][]
): string[][] {
  const grid = Array.from({ length: metadata.size }, () => Array(metadata.size).fill(''))
  for (let r = 0; r < metadata.size; r++) {
    for (let c = 0; c < metadata.size; c++) {
      if (!metadata.blocked[r]?.[c]) grid[r][c] = localDrafts[r]?.[c] ?? ''
    }
  }
  for (const s of submissions) {
    if (s.player_id === playerId && s.is_correct) grid[s.cell_row][s.cell_col] = s.submitted_letter.toUpperCase()
  }
  return grid
}

// ── Scoring ─────────────────────────────────────────────────────────────────────

/**
 * Word-based scoring: +CROSSWORD_WORD_POINTS per word a player fully solves, plus
 * CROSSWORD_FIRST_WORD_BONUS to whoever completed each word first, minus
 * CROSSWORD_HINT_PENALTY for every "reveal letter" hint used.
 */
export function tallyCrosswordScores(
  metadata: CrosswordMetadata,
  submissions: Pick<
    CrosswordSubmission,
    'player_id' | 'cell_row' | 'cell_col' | 'is_correct' | 'via_hint' | 'submitted_at'
  >[],
  players: { id: string; name: string; spectator?: boolean | null }[]
): CrosswordPlayerScore[] {
  const activePlayers = players.filter((p) => p.spectator !== true)
  const activeIds = new Set(activePlayers.map((p) => p.id))

  const points = new Map<string, number>()
  const wordsCompleted = new Map<string, number>()
  const hints = new Map<string, number>()
  for (const p of activePlayers) {
    points.set(p.id, 0)
    wordsCompleted.set(p.id, 0)
    hints.set(p.id, 0)
  }

  // Count hints used per player.
  for (const s of submissions) {
    if (s.via_hint && activeIds.has(s.player_id)) hints.set(s.player_id, (hints.get(s.player_id) ?? 0) + 1)
  }

  // When did each (player, cell) become correct? Earliest correct submission per cell.
  const cellTime = new Map<string, number>()
  for (const s of submissions) {
    if (!s.is_correct || !activeIds.has(s.player_id)) continue
    const key = `${s.player_id}|${s.cell_row}-${s.cell_col}`
    const t = new Date(s.submitted_at).getTime()
    if (!cellTime.has(key) || t < cellTime.get(key)!) cellTime.set(key, t)
  }

  for (const clue of metadata.clues) {
    const cells = crosswordWordCells(clue)
    // Completion time per player for this word = the max over its cells (last cell filled).
    const completedAt: { playerId: string; time: number }[] = []
    for (const p of activePlayers) {
      let last = 0
      let complete = true
      for (const [r, c] of cells) {
        const t = cellTime.get(`${p.id}|${r}-${c}`)
        if (t === undefined) {
          complete = false
          break
        }
        if (t > last) last = t
      }
      if (complete) completedAt.push({ playerId: p.id, time: last })
    }
    if (completedAt.length === 0) continue

    completedAt.sort((a, b) => a.time - b.time)
    const firstId = completedAt[0].playerId
    for (const { playerId } of completedAt) {
      points.set(playerId, (points.get(playerId) ?? 0) + CROSSWORD_WORD_POINTS)
      wordsCompleted.set(playerId, (wordsCompleted.get(playerId) ?? 0) + 1)
    }
    points.set(firstId, (points.get(firstId) ?? 0) + CROSSWORD_FIRST_WORD_BONUS)
  }

  // Apply hint penalties.
  for (const p of activePlayers) {
    points.set(p.id, (points.get(p.id) ?? 0) + (hints.get(p.id) ?? 0) * CROSSWORD_HINT_PENALTY)
  }

  return activePlayers
    .map((p) => ({
      player_id: p.id,
      name: p.name,
      points: points.get(p.id) ?? 0,
      wordsCompleted: wordsCompleted.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || b.wordsCompleted - a.wordsCompleted || a.name.localeCompare(b.name))
}

// ── Duration / timer ────────────────────────────────────────────────────────────

export function clampCrosswordGameDuration(seconds: number): number {
  const n = Number.isFinite(seconds) ? Math.round(seconds) : CROSSWORD_DEFAULT_DURATION
  return CROSSWORD_GAME_DURATION_OPTIONS.reduce((best, option) =>
    Math.abs(option - n) < Math.abs(best - n) ? option : best
  )
}

export function formatCrosswordGameDuration(seconds: number): string {
  if (!seconds) return 'No limit'
  const minutes = Math.round(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

export function crosswordGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  return Date.now() - new Date(sessionStartedAt).getTime() >= durationSeconds * 1000
}

export function parseCrosswordDifficulty(raw: unknown): CrosswordDifficulty {
  return CROSSWORD_DIFFICULTIES.includes(raw as CrosswordDifficulty)
    ? (raw as CrosswordDifficulty)
    : CROSSWORD_DEFAULT_DIFFICULTY
}

// ── Session data ────────────────────────────────────────────────────────────────

/**
 * Build the round row (client-readable metadata: layout + clues, NO letters) plus the
 * solution grid to be written separately to the RLS-protected crossword_solutions table.
 */
export function buildCrosswordRoundRow(gameId: string, metadata: CrosswordMetadata, solution: string[][]) {
  return {
    roundRow: {
      game_id: gameId,
      round_number: 1,
      status: 'active' as const,
      started_at: new Date().toISOString(),
      participant_ids: [] as string[],
      crossword_metadata: metadata,
    },
    solution,
  }
}

export async function clearCrosswordSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  return clearSessionTables(supabase, gameId, ['crossword_submissions'])
}
