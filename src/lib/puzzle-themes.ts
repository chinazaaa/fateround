import {
  parseCrosswordEntryImport,
  parseWordSearchEntryImport,
  parseWordScrambleEntryImport,
} from '@/lib/custom-questions'

/**
 * Admin-authored puzzle themes (the `puzzle_themes` table). A theme is a named word pool for
 * Crossword / Word Search / Word Scramble plus an optional LOCKED difficulty. Shared helpers
 * so the admin CRUD routes and the create-game consumption agree on shapes + validation.
 */

export const PUZZLE_THEME_GAME_TYPES = ['crossword', 'word_search', 'word_scramble', 'wordle_room'] as const
export type PuzzleThemeGameType = (typeof PUZZLE_THEME_GAME_TYPES)[number]

export const PUZZLE_THEME_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type PuzzleThemeDifficulty = (typeof PUZZLE_THEME_DIFFICULTIES)[number]

/** A workable pool needs enough words to pack a grid across difficulties (hard targets ~14). */
export const PUZZLE_THEME_MIN_ENTRIES = 8
export const PUZZLE_THEME_MAX_NAME = 60

export function isPuzzleThemeGameType(v: unknown): v is PuzzleThemeGameType {
  return typeof v === 'string' && (PUZZLE_THEME_GAME_TYPES as readonly string[]).includes(v)
}

export function isPuzzleThemeDifficulty(v: unknown): v is PuzzleThemeDifficulty {
  return typeof v === 'string' && (PUZZLE_THEME_DIFFICULTIES as readonly string[]).includes(v)
}

export type PuzzleThemeParse = {
  entries: Record<string, string>[]
  totalRows: number
  skippedRows: number
  duplicateRows: number
}

/**
 * Parse CSV text into deduped entries for the game type (reusing the same parsers the host-side
 * custom-pool upload uses, so an admin theme and a hand-uploaded pool are byte-identical shapes):
 * crossword `answer,clue`; word_search `word`; word_scramble `word[,hint]`.
 */
export function parsePuzzleThemeCsv(gameType: PuzzleThemeGameType, csv: string): PuzzleThemeParse {
  if (gameType === 'crossword') {
    const r = parseCrosswordEntryImport(csv)
    return { entries: r.questions, totalRows: r.totalRows, skippedRows: r.skippedRows, duplicateRows: r.duplicateRows }
  }
  if (gameType === 'word_search') {
    const r = parseWordSearchEntryImport(csv)
    return { entries: r.questions, totalRows: r.totalRows, skippedRows: r.skippedRows, duplicateRows: r.duplicateRows }
  }
  if (gameType === 'wordle_room') {
    // Same word[,hint] shape as scramble — but wordle constrains length to 3–8 letters.
    const r = parseWordScrambleEntryImport(csv)
    const filtered = r.questions.filter((e) => e.word.length >= 3 && e.word.length <= 8)
    return {
      entries: filtered.map((e) => {
        const entry: Record<string, string> = { word: e.word }
        if (e.hint) entry.hint = e.hint
        return entry
      }),
      totalRows: r.totalRows,
      skippedRows: r.skippedRows + (r.questions.length - filtered.length),
      duplicateRows: r.duplicateRows,
    }
  }
  const r = parseWordScrambleEntryImport(csv)
  return {
    entries: r.questions.map((e) => {
      const entry: Record<string, string> = { word: e.word }
      if (e.hint) entry.hint = e.hint
      return entry
    }),
    totalRows: r.totalRows,
    skippedRows: r.skippedRows,
    duplicateRows: r.duplicateRows,
  }
}

/** Quote a CSV field only when it contains a comma, quote, or newline (escaping `"` as `""`). */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Serialize stored theme entries back into editable CSV text (header + rows) matching the shape
 * `parsePuzzleThemeCsv` expects, so the admin edit form can show the current words for
 * line-by-line editing instead of only offering a blind "replace".
 */
export function puzzleThemeEntriesToCsv(gameType: PuzzleThemeGameType, entries: Record<string, string>[]): string {
  if (gameType === 'crossword') {
    const rows = entries.map((e) => `${csvField(e.answer ?? '')},${csvField(e.clue ?? '')}`)
    return ['answer,clue', ...rows].join('\n')
  }
  if (gameType === 'word_scramble' || gameType === 'wordle_room') {
    const rows = entries.map((e) => `${csvField(e.word ?? '')},${csvField(e.hint ?? '')}`)
    return ['word,hint', ...rows].join('\n')
  }
  // word_search — single column
  const rows = entries.map((e) => csvField(e.word ?? ''))
  return ['word', ...rows].join('\n')
}

/** Public-safe metadata for the theme dropdown — NEVER includes `entries` (they hold answers). */
export type PuzzleThemeMeta = {
  id: string
  game_type: PuzzleThemeGameType
  name: string
  difficulty: PuzzleThemeDifficulty | null
  entry_count: number
}

export function toPuzzleThemeMeta(row: {
  id: string
  game_type: string
  name: string
  difficulty: string | null
  entry_count: number
}): PuzzleThemeMeta {
  return {
    id: row.id,
    game_type: row.game_type as PuzzleThemeGameType,
    name: row.name,
    difficulty: (row.difficulty as PuzzleThemeDifficulty | null) ?? null,
    entry_count: row.entry_count,
  }
}
