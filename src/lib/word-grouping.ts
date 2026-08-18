export {
  WORD_GROUPING_MIN_PLAYERS,
  WORD_GROUPING_MAX_PLAYERS,
  WORD_GROUPING_DEFAULT_MAX_PLAYERS,
  WORD_GROUPING_DEFAULT_DURATION,
  WORD_GROUPING_GAME_DURATION_OPTIONS,
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_TOTAL_GROUPS,
  WORD_GROUPING_WORDS_PER_GROUP,
  WORD_GROUPING_GROUP_POINTS,
  WORD_GROUPING_FIRST_BONUS,
  WORD_GROUPING_MISTAKE_PENALTY,
  WORD_GROUPING_PERFECT_BONUS,
  formatWordGroupingGameDuration,
  tallyWordGroupingScores,
  type WordGroupingGroup,
  type WordGroupingPuzzle,
} from '../../packages/shared/src/word-grouping'

import {
  WORD_GROUPING_GAME_DURATION_OPTIONS as DURATION_OPTIONS,
  WORD_GROUPING_DEFAULT_DURATION as DEFAULT_DURATION,
} from '../../packages/shared/src/word-grouping'

export function clampWordGroupingGameDuration(seconds: number): number {
  // Guard: `Math.abs(NaN - x)` is NaN → every comparison is false → `best` sticks at opts[0]
  // (which is 0 = "No limit"). A missing or NaN input should fall back to the platform default,
  // not silently disable the timer.
  if (!Number.isFinite(seconds)) return DEFAULT_DURATION
  const opts = [...DURATION_OPTIONS]
  let best = opts[0]
  let bestDist = Math.abs(best - seconds)
  for (const o of opts) {
    const dist = Math.abs(o - seconds)
    // `<=` so a tie prefers the LATER option (higher-index = longer timer): with the previous
    // strict `<`, `seconds = 60` snapped to 0 (No limit) rather than 120s, because both were
    // 60 away and the first-seen won. Ordering the options ascending keeps this deterministic.
    if (dist <= bestDist) {
      best = o
      bestDist = dist
    }
  }
  return best
}

/**
 * Seconds from the puzzle starting to a player's last correct group — what to show as their
 * time. Null when they never solved one (or the session has no start time), so callers can
 * leave the clock off rather than print a misleading 0:00.
 */
export function wordGroupingFinishSeconds(
  sessionStartedAt: string | null | undefined,
  lastAt: string | null | undefined
): number | null {
  if (!sessionStartedAt || !lastAt) return null
  const secs = Math.floor((new Date(lastAt).getTime() - new Date(sessionStartedAt).getTime()) / 1000)
  return Number.isFinite(secs) ? Math.max(0, secs) : null
}

/**
 * Canonical shape validator for a persisted WG puzzle pool — used by every write path
 * (create route, lobby-settings route). Both call sites used to shortcut with `groups is an
 * array` / `as unknown[]`, so malformed puzzles could reach `custom_questions` and only fail
 * at game start when `generateWordGroupingFromContent` rejected them silently (falling back
 * to the built-in bank). This runs the same shape check `generateWordGroupingFromContent`
 * does — the pool is a non-empty array of `{ groups: [{category, words:[4], difficulty:1-4}]×4 }`
 * puzzles with 16 unique words across the four groups. Returns the normalised (trimmed)
 * pool on success or null.
 */
export type WordGroupingPuzzleEntry = { groups: { category: string; words: string[]; difficulty: 1 | 2 | 3 | 4 }[] }

/**
 * Stable content key for a WG puzzle — used to remember which puzzles a game has already
 * dealt so play-again avoids repeats. Sort categories so the key doesn't drift when a client
 * reorders groups by difficulty for display.
 */
export function wordGroupingPuzzleKey(puzzle: WordGroupingPuzzleEntry | { groups: { category: string }[] }): string {
  // JSON-encode the sorted category array rather than joining with a delimiter — a category
  // that itself contains the delimiter would collide otherwise (e.g. `["a|b","c","d","e"]`
  // and `["a","b|c","d","e"]` both flatten to `"a|b|c|d|e"`), which would let the picker
  // exhaust the pool early and start repeating before every distinct puzzle was dealt.
  return JSON.stringify(puzzle.groups.map((g) => g.category.trim().toLowerCase()).sort())
}

/**
 * From `pool` pick one puzzle the game hasn't dealt yet — reset the cycle if every puzzle in
 * the pool has already been used. Deterministic given `seed`, so retries on the same round
 * (e.g. inside a serverless retry window) don't shuffle. Returns the chosen puzzle plus the
 * updated usage map so the caller can persist it back on `game.pool_usage.word_grouping`.
 */
export function pickWordGroupingPuzzle(
  pool: WordGroupingPuzzleEntry[],
  seed: number,
  used: Record<string, number> | undefined
): { puzzle: WordGroupingPuzzleEntry; nextUsage: Record<string, number> } | null {
  if (pool.length === 0) return null
  const usedKeys = new Set(Object.keys(used ?? {}))
  const fresh = pool.filter((p) => !usedKeys.has(wordGroupingPuzzleKey(p)))
  // Every puzzle in the pool has been dealt at least once — reset the cycle so the pool can
  // start over. Without this, a small library pack (or a small built-in bank) would deadlock
  // once the whole pool is exhausted.
  const candidates = fresh.length > 0 ? fresh : pool
  const cycleReset = fresh.length === 0
  const idx = ((seed % candidates.length) + candidates.length) % candidates.length
  const puzzle = candidates[idx]
  const base = cycleReset ? {} : { ...(used ?? {}) }
  const key = wordGroupingPuzzleKey(puzzle)
  base[key] = (base[key] ?? 0) + 1
  return { puzzle, nextUsage: base }
}
export function parseStoredWordGroupingPuzzles(raw: unknown): WordGroupingPuzzleEntry[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: WordGroupingPuzzleEntry[] = []
  const wordsPerGroup = 4
  const groupsPerPuzzle = 4
  for (const rawPuzzle of raw) {
    if (!rawPuzzle || typeof rawPuzzle !== 'object') return null
    const puzzle = rawPuzzle as Record<string, unknown>
    if (!Array.isArray(puzzle.groups) || puzzle.groups.length !== groupsPerPuzzle) return null
    const groups: WordGroupingPuzzleEntry['groups'] = []
    const allWords: string[] = []
    for (const rawGroup of puzzle.groups) {
      if (!rawGroup || typeof rawGroup !== 'object') return null
      const g = rawGroup as Record<string, unknown>
      const category = typeof g.category === 'string' ? g.category.trim() : ''
      if (!category) return null
      if (!Array.isArray(g.words) || g.words.length !== wordsPerGroup) return null
      const words: string[] = []
      for (const w of g.words) {
        if (typeof w !== 'string') return null
        const trimmed = w.trim()
        if (!trimmed) return null
        words.push(trimmed)
        allWords.push(trimmed.toLowerCase())
      }
      const diff = Number(g.difficulty)
      if (![1, 2, 3, 4].includes(diff)) return null
      groups.push({ category, words, difficulty: diff as 1 | 2 | 3 | 4 })
    }
    if (new Set(allWords).size !== groupsPerPuzzle * wordsPerGroup) return null
    out.push({ groups })
  }
  return out
}

/**
 * Sample CSV shown as a downloadable template under "Your own" for Word Grouping pools —
 * one row per group, four rows per puzzle, `puzzle` column ties them together. Kept in
 * lockstep with the library submit page's sample so hosts can share the same file between
 * both flows.
 */
export const WORD_GROUPING_SAMPLE_CSV = [
  'puzzle,category,difficulty,word1,word2,word3,word4',
  '1,Fruits,1,Apple,Pear,Peach,Plum',
  '1,Colors,2,Red,Blue,Purple,Orange',
  '1,Animals,3,Cat,Dog,Bird,Fish',
  '1,___ ball,4,Foot,Basket,Base,Snow',
  '2,Days of the week,1,Monday,Friday,Sunday,Wednesday',
  '2,Continents,2,Asia,Europe,Africa,Australia',
  '2,Kitchen tools,3,Knife,Fork,Spoon,Plate',
  '2,___ time,4,Bed,Show,Dinner,Prime',
  '',
].join('\n')

/**
 * Text uploader for "Your own" WG pools. Accepts two shapes:
 *   1. JSON-per-line — the same format `parseStoredWordGroupingPuzzles` produces on export
 *      (`{"groups":[{"category":"...","words":[...],"difficulty":1},...]}`).
 *   2. CSV — one row per group, four rows sharing a `puzzle` column form one puzzle. Columns
 *      required: `puzzle, category, difficulty, word1, word2, word3, word4`. Mirrors the format
 *      used by the library submit page + `WORD_GROUPING_SAMPLE_CSV` above so hosts and pack
 *      authors share one file layout.
 * Returns the raw entries plus row counts so the UI can surface `Loaded N, skipped M`. The
 * result is fed to `parseStoredWordGroupingPuzzles` next, which enforces the final shape.
 */
export function parseWordGroupingPoolText(text: string): {
  entries: unknown[]
  totalRows: number
  skippedRows: number
} {
  const trimmed = text.trim()
  if (!trimmed) return { entries: [], totalRows: 0, skippedRows: 0 }

  // Distinguish JSON-per-line (first non-empty line is `{`) from the CSV path. Anything else
  // falls through to CSV parsing, which fails loudly with row-level errors.
  const firstLine = trimmed.split(/\r?\n/, 1)[0]!.trim()
  if (firstLine.startsWith('{')) {
    const entries: unknown[] = []
    let totalRows = 0
    let skippedRows = 0
    for (const line of trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)) {
      totalRows += 1
      try {
        const obj = JSON.parse(line)
        if (obj && typeof obj === 'object' && Array.isArray((obj as { groups?: unknown }).groups)) {
          entries.push(obj)
          continue
        }
      } catch {
        // Not JSON — skipped.
      }
      skippedRows += 1
    }
    return { entries, totalRows, skippedRows }
  }

  return parseWordGroupingCsvText(trimmed)
}

/**
 * CSV-only WG parser. Every four rows sharing a `puzzle` column build one puzzle, with each
 * row contributing one group (category + difficulty 1–4 + 4 words). Returns raw entries as
 * `{ groups: [...] }[]` — hand off to `parseStoredWordGroupingPuzzles` for shape validation.
 * Kept separate from the JSON branch so the smell test in `parseWordGroupingPoolText`
 * (`startsWith('{')`) stays one glance.
 */
function parseWordGroupingCsvText(text: string): {
  entries: unknown[]
  totalRows: number
  skippedRows: number
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return { entries: [], totalRows: 0, skippedRows: 0 }

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const required = ['puzzle', 'category', 'difficulty', 'word1', 'word2', 'word3', 'word4']
  if (!required.every((c) => headers.includes(c))) {
    // Header missing — treat every data line as skipped so the UI reports 0 loaded.
    return { entries: [], totalRows: lines.length - 1, skippedRows: lines.length - 1 }
  }

  const byPuzzle = new Map<string, { category: string; difficulty: number; words: string[] }[]>()
  let totalRows = 0
  let skippedRows = 0
  for (let i = 1; i < lines.length; i += 1) {
    totalRows += 1
    const cols = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = (cols[j] ?? '').trim()
    }
    const key = row.puzzle
    const category = row.category
    const difficulty = Number(row.difficulty)
    const words = [row.word1, row.word2, row.word3, row.word4].filter(Boolean)
    if (!key || !category || ![1, 2, 3, 4].includes(difficulty) || words.length !== 4) {
      skippedRows += 1
      continue
    }
    const list = byPuzzle.get(key) ?? []
    list.push({ category, difficulty, words })
    byPuzzle.set(key, list)
  }

  const entries: unknown[] = []
  for (const groups of byPuzzle.values()) {
    if (groups.length !== 4) {
      // A partial puzzle wasted its rows — count them as skipped.
      skippedRows += groups.length
      continue
    }
    groups.sort((a, b) => a.difficulty - b.difficulty)
    entries.push({ groups })
  }
  return { entries, totalRows, skippedRows }
}

/** Minimal quote-aware CSV field splitter (same shape as `src/lib/csv-parse.ts`) to keep this
 * file self-contained and importable by any client bundle without dragging that helper in. */
function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }
    current += ch
  }
  result.push(current)
  return result
}
