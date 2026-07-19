import type { SupabaseClient } from '@supabase/supabase-js'
import { MLT_QUESTIONS } from '@/lib/most-likely-to-questions'
import { NHIE_QUESTIONS } from '@/lib/never-have-i-ever-questions'
import { PAN_QUESTIONS } from '@/lib/pick-a-number-questions'
import { WYR_QUESTIONS, type WyrQuestion } from '@/lib/would-you-rather-questions'
import { THIS_OR_THAT_QUESTIONS } from '@/lib/this-or-that-questions'
import { QUIPLASH_PROMPTS } from '@/lib/quiplash-prompts'
import { QUICK_DRAW_PROMPTS } from '@/lib/quick-draw-prompts'
import { parseWyrQuestionRows } from '@/lib/custom-questions'

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

// --- Shared helpers for two-option banks (would_you_rather / this_or_that) ---

/** Quote a CSV field only when it contains a comma, quote, or newline. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Parse "optionA,optionB" rows into deduped WyrQuestion entries + stats. */
function parseWyrLines(text: string): PlatformContentParse {
  const parsed = parseWyrQuestionRows(text)
  const totalRows = text.split(/\r?\n/).filter((l) => l.trim()).length
  const seen = new Set<string>()
  const entries: WyrQuestion[] = []
  let duplicateRows = 0
  for (const q of parsed) {
    const key = `${q.optionA.toLowerCase()}|${q.optionB.toLowerCase()}`
    if (seen.has(key)) {
      duplicateRows++
      continue
    }
    seen.add(key)
    entries.push(q)
  }
  return { entries, totalRows, skippedRows: Math.max(0, totalRows - parsed.length), duplicateRows }
}

function wyrToText(entries: unknown[]): string {
  const rows = (entries as WyrQuestion[]).map((q) => `${csvField(q.optionA ?? '')},${csvField(q.optionB ?? '')}`)
  return ['option_a,option_b', ...rows].join('\n')
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

const NEVER_HAVE_I_EVER_DEF: PlatformGameDef = {
  gameType: 'never_have_i_ever',
  label: 'Never Have I Ever',
  columns: 'one prompt per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'question'),
  toText: (entries) => stringLinesToText(entries, 'question'),
  builtins: [{ key: 'default', label: 'Never Have I Ever — Built-in', entries: NHIE_QUESTIONS }],
}

const PICK_A_NUMBER_DEF: PlatformGameDef = {
  gameType: 'pick_a_number',
  label: 'Pick a Number',
  columns: 'one prompt per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'question'),
  toText: (entries) => stringLinesToText(entries, 'question'),
  builtins: [{ key: 'default', label: 'Pick a Number — Built-in', entries: PAN_QUESTIONS }],
}

const WOULD_YOU_RATHER_DEF: PlatformGameDef = {
  gameType: 'would_you_rather',
  label: 'Would You Rather',
  columns: 'option_a,option_b',
  minEntries: 5,
  parse: parseWyrLines,
  toText: wyrToText,
  builtins: [{ key: 'default', label: 'Would You Rather — Built-in', entries: WYR_QUESTIONS }],
}

const THIS_OR_THAT_DEF: PlatformGameDef = {
  gameType: 'this_or_that',
  label: 'This or That',
  columns: 'option_a,option_b',
  minEntries: 5,
  parse: parseWyrLines,
  toText: wyrToText,
  builtins: [{ key: 'default', label: 'This or That — Built-in', entries: THIS_OR_THAT_QUESTIONS }],
}

const QUIPLASH_DEF: PlatformGameDef = {
  gameType: 'quiplash',
  label: 'Quiplash',
  columns: 'one prompt per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'prompt'),
  toText: (entries) => stringLinesToText(entries, 'prompt'),
  // Stored as plain strings (pickCustomQuiplashPrompts wraps them into {prompt} at draw time).
  builtins: [{ key: 'default', label: 'Quiplash — Built-in', entries: QUIPLASH_PROMPTS.map((p) => p.prompt) }],
}

// Quick Draw has two modes with separate banks. Lie mode = surreal scene prompts (this one);
// Guess mode = a word bank (variant 'guess', still on the hardcoded list — not wired yet).
const QUICK_DRAW_LIE_DEF: PlatformGameDef = {
  gameType: 'quick_draw',
  variant: 'lie',
  label: 'Quick Draw · Lie mode',
  columns: 'one prompt per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'prompt'),
  toText: (entries) => stringLinesToText(entries, 'prompt'),
  builtins: [
    { key: 'default', label: 'Quick Draw Lie prompts — Built-in', entries: QUICK_DRAW_PROMPTS.map((p) => p.prompt) },
  ],
}

const PLATFORM_GAME_DEFS: PlatformGameDef[] = [
  MOST_LIKELY_TO_DEF,
  NEVER_HAVE_I_EVER_DEF,
  PICK_A_NUMBER_DEF,
  WOULD_YOU_RATHER_DEF,
  THIS_OR_THAT_DEF,
  QUIPLASH_DEF,
  QUICK_DRAW_LIE_DEF,
]

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
