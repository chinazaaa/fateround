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
  return puzzle.groups
    .map((g) => g.category.trim().toLowerCase())
    .sort()
    .join('|')
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
