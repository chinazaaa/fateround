import type { SupabaseClient } from '@supabase/supabase-js'
import { MLT_QUESTIONS } from '@/lib/most-likely-to-questions'

/**
 * Admin-managed "platform" content banks (the `platform_content` table). Each supported game
 * exposes: how to parse the admin CSV/line editor into its native entry shape, how to serialize
 * stored entries back to editable text, and the hardcoded builtin batches used to seed defaults.
 *
 * Consumption rule (see the game start/create routes): draw from the union of active rows for the
 * game_type; if there are none — or the table read fails (e.g. migration not applied yet) — fall
 * back to the game's hardcoded array. So this is a safety-netted replacement, never additive.
 */

export const PLATFORM_CONTENT_MAX_LABEL = 80

export type PlatformContentParse = {
  entries: unknown[]
  totalRows: number
  skippedRows: number
  duplicateRows: number
}

export type PlatformBuiltinBatch = {
  key: string
  label: string
  entries: unknown[]
}

export type PlatformGameDef = {
  gameType: string
  /** Optional sub-pool key for games with more than one bank (e.g. quick_draw). */
  variant?: string
  label: string
  /** CSV/columns hint shown in the admin editor. */
  columns: string
  /** Minimum entries a batch must have to be saved. */
  minEntries: number
  /** Parse the admin editor text into deduped native-shape entries + stats. */
  parse: (text: string) => PlatformContentParse
  /** Serialize stored entries back into editable text for the admin editor. */
  toText: (entries: unknown[]) => string
  /** Hardcoded default batches, seeded into the table by the import-builtins route. */
  builtins: PlatformBuiltinBatch[]
}

// --- Shared helpers for plain one-per-line string banks (MLT / NHIE / PAN / codewords / describe_it) ---

/** Parse newline-separated text into deduped, order-preserving strings (drops a matching header). */
function parseStringLines(text: string, header: string, opts: { lowercase?: boolean } = {}): PlatformContentParse {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines[0]?.toLowerCase() === header.toLowerCase()) lines.shift()

  const seen = new Set<string>()
  const entries: string[] = []
  let duplicateRows = 0
  for (const raw of lines) {
    const value = opts.lowercase ? raw.toLowerCase() : raw
    const key = value.toLowerCase()
    if (seen.has(key)) {
      duplicateRows++
      continue
    }
    seen.add(key)
    entries.push(value)
  }
  return { entries, totalRows: lines.length, skippedRows: lines.length - entries.length - duplicateRows, duplicateRows }
}

/** Serialize a string bank back to editable text (header + one per line). */
function stringLinesToText(entries: unknown[], header: string): string {
  const rows = (entries as unknown[]).map((e) => String(e ?? '').trim()).filter(Boolean)
  return [header, ...rows].join('\n')
}

// --- Registry of supported games (add games here as they are migrated off hardcoded arrays) ---

const MOST_LIKELY_TO_DEF: PlatformGameDef = {
  gameType: 'most_likely_to',
  label: 'Most Likely To',
  columns: 'one prompt per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'question'),
  toText: (entries) => stringLinesToText(entries, 'question'),
  builtins: [{ key: 'default', label: 'Most Likely To — Built-in', entries: MLT_QUESTIONS }],
}

const PLATFORM_GAME_DEFS: PlatformGameDef[] = [MOST_LIKELY_TO_DEF]

/** All game defs, optionally keyed by `${gameType}:${variant}` for multi-pool games. */
export function platformGameDefs(): PlatformGameDef[] {
  return PLATFORM_GAME_DEFS
}

export type PlatformGameMeta = {
  gameType: string
  variant: string | null
  label: string
  columns: string
  minEntries: number
}

/** Metadata only (no builtin entries) — for the admin UI tab list. */
export function platformGameList(): PlatformGameMeta[] {
  return PLATFORM_GAME_DEFS.map((d) => ({
    gameType: d.gameType,
    variant: d.variant ?? null,
    label: d.label,
    columns: d.columns,
    minEntries: d.minEntries,
  }))
}

export function platformGameDef(gameType: string, variant?: string | null): PlatformGameDef | undefined {
  return PLATFORM_GAME_DEFS.find((d) => d.gameType === gameType && (d.variant ?? null) === (variant ?? null))
}

export function isPlatformContentGameType(gameType: string, variant?: string | null): boolean {
  return !!platformGameDef(gameType, variant)
}

/**
 * Load the union of active platform entries for a game_type (+ optional variant). Returns [] on any
 * error or when empty — callers treat [] as "fall back to the hardcoded array". Uses the passed
 * client (service-role, since the table is RLS-locked with no policy).
 */
export async function loadPlatformEntries<T = unknown>(
  supabase: SupabaseClient,
  gameType: string,
  variant?: string | null
): Promise<T[]> {
  try {
    let query = supabase
      .from('platform_content')
      .select('entries')
      .eq('game_type', gameType)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    query = variant == null ? query.is('variant', null) : query.eq('variant', variant)

    const { data, error } = await query
    if (error || !data) return []
    return data.flatMap((row) => (Array.isArray(row.entries) ? (row.entries as T[]) : []))
  } catch {
    return []
  }
}
