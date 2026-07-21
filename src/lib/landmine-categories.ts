/**
 * Admin-authored Landmine category pools (the `landmine_categories` table). A category is a
 * named, ORDERED word list — obvious-first, because `pickMines` (see landmine.ts) weights the
 * secret mine draw toward the front. Shared helpers so the admin CRUD routes and the game's
 * consumption agree on shapes + validation.
 *
 * The table is RLS-on / no-policy (service-role only) and `entries` are secret — players only
 * ever see the category name + count, never the words.
 */

/** A pool needs enough obvious answers that the round actually lands on a mine someone hits. */
export const LANDMINE_CATEGORY_MIN_ENTRIES = 4
export const LANDMINE_CATEGORY_MAX_NAME = 60
/** Guardrails so a paste-bomb can't blow up a row; generous for a real category. */
export const LANDMINE_CATEGORY_MAX_ENTRIES = 300
export const LANDMINE_CATEGORY_MAX_WORD = 60

export type LandmineCategoryParse = {
  entries: string[]
  totalRows: number
  skippedRows: number
  duplicateRows: number
}

/**
 * Parse a raw word list into deduped, ordered, lowercased entries. Accepts one word (or short
 * phrase) per line AND/OR comma-separated values, so an admin can paste either. ORDER IS
 * PRESERVED (obvious-first) — the mine draw depends on it. Dedup is case-insensitive and keeps
 * the first occurrence. Words longer than `LANDMINE_CATEGORY_MAX_WORD` are skipped, and the list
 * is capped at `LANDMINE_CATEGORY_MAX_ENTRIES`.
 */
export function parseLandmineCategoryWords(raw: string): LandmineCategoryParse {
  const tokens = raw.split(/[\n,]/).map((t) => t.trim().toLowerCase())

  let totalRows = 0
  let skippedRows = 0
  let duplicateRows = 0
  const seen = new Set<string>()
  const entries: string[] = []

  for (const token of tokens) {
    if (!token) continue
    totalRows++
    if (token.length > LANDMINE_CATEGORY_MAX_WORD) {
      skippedRows++
      continue
    }
    if (seen.has(token)) {
      duplicateRows++
      continue
    }
    if (entries.length >= LANDMINE_CATEGORY_MAX_ENTRIES) {
      skippedRows++
      continue
    }
    seen.add(token)
    entries.push(token)
  }

  return { entries, totalRows, skippedRows, duplicateRows }
}

/** Turn a stored `entries` array back into editable textarea text (one word per line). */
export function landmineCategoryWordsToText(entries: unknown): string {
  if (!Array.isArray(entries)) return ''
  return entries
    .map((e) => (typeof e === 'string' ? e : ''))
    .filter(Boolean)
    .join('\n')
}
