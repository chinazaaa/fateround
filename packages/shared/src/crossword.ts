import type {
  CrosswordClue,
  CrosswordDifficulty,
  CrosswordDirection,
  CrosswordMetadata,
  CrosswordSubmission,
} from './types'

// Client-safe crossword logic ported from web `src/lib/crossword.ts`. This mirrors the
// same pure/DB boundary as `sudoku.ts`: interfaces + constants + pure helpers only.
// Puzzle generation, round-row building, and any Supabase/DB work stay web-only.

export type { CrosswordClue, CrosswordDifficulty, CrosswordDirection, CrosswordMetadata, CrosswordSubmission }

// ── Constants ────────────────────────────────────────────────────────────────

// 1 so a single player can solve a crossword on their own (like Sudoku/Yahtzee),
// not only in a race with others.
export const CROSSWORD_MIN_PLAYERS = 1
export const CROSSWORD_MAX_PLAYERS = 20
export const CROSSWORD_DEFAULT_MAX_PLAYERS = 20

export const CROSSWORD_DEFAULT_DURATION = 900 // 15 minutes
export const CROSSWORD_GAME_DURATION_OPTIONS = [0, 300, 600, 900, 1200, 1800] as const

/** Base points for correctly completing a whole word. */
export const CROSSWORD_WORD_POINTS = 10
/** Bonus for being the FIRST player to complete a given word. */
export const CROSSWORD_FIRST_WORD_BONUS = 5
/** Penalty applied per "reveal letter" hint used. */
export const CROSSWORD_HINT_PENALTY = -3

export const CROSSWORD_DIFFICULTIES: CrosswordDifficulty[] = ['easy', 'medium', 'hard']
export const CROSSWORD_DEFAULT_DIFFICULTY: CrosswordDifficulty = 'medium'

// ── Themes (minimal id/label list mirroring web `crosswordThemeOptions`) ────────

/** Theme options for the create flow; labels must match web `CROSSWORD_THEMES`. */
export const CROSSWORD_THEME_OPTIONS: { id: string; label: string }[] = [
  { id: 'general', label: 'General Knowledge' },
  { id: 'animals', label: 'Animals' },
  { id: 'food', label: 'Food & Drink' },
  { id: 'science', label: 'Science' },
]

export const CROSSWORD_DEFAULT_THEME = CROSSWORD_THEME_OPTIONS[0]!.id

// ── Extra types ─────────────────────────────────────────────────────────────

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

export type CellSub = Pick<CrosswordSubmission, 'player_id' | 'cell_row' | 'cell_col' | 'is_correct'>

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

export function playerCompletionPercent(
  metadata: CrosswordMetadata,
  submissions: CellSub[],
  playerId: string
): number {
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
    if (!owners[s.cell_row]?.[s.cell_col]) owners[s.cell_row]![s.cell_col] = s.player_id
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
    if (s.player_id === playerId && s.is_correct) grid[s.cell_row]![s.cell_col] = true
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
      if (!metadata.blocked[r]?.[c]) grid[r]![c] = localDrafts[r]?.[c] ?? ''
    }
  }
  for (const s of submissions) {
    if (s.player_id === playerId && s.is_correct) grid[s.cell_row]![s.cell_col] = s.submitted_letter.toUpperCase()
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
    const firstId = completedAt[0]!.playerId
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
