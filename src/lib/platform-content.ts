import type { SupabaseClient } from '@supabase/supabase-js'
import { MLT_QUESTIONS } from '@/lib/most-likely-to-questions'
import { NHIE_QUESTIONS } from '@/lib/never-have-i-ever-questions'
import { PAN_QUESTIONS } from '@/lib/pick-a-number-questions'
import { WYR_QUESTIONS, type WyrQuestion } from '@/lib/would-you-rather-questions'
import { THIS_OR_THAT_QUESTIONS } from '@/lib/this-or-that-questions'
import { QUIPLASH_PROMPTS } from '@/lib/quiplash-prompts'
import { QUICK_DRAW_PROMPTS } from '@/lib/quick-draw-prompts'
import { QUICK_DRAW_GUESS_WORD_POOL } from '@/lib/quick-draw-guess-words'
import { CODEWORDS_WORD_POOL } from '@/lib/codewords-words'
import { CODEWORDS_MIN_CUSTOM_POOL } from '@/lib/codewords-pool'
import { DESCRIBE_IT_WORD_POOL } from '@/lib/describe-it-words'
import { TRIVIA_TECH_QUESTIONS, TRIVIA_GENERAL_QUESTIONS } from '@/lib/trivia-questions'
import { parseWyrQuestionRows, parseTriviaQuestionImport } from '@/lib/custom-questions'
import type { TriviaQuestion, TriviaCategory } from '@/types'
import { TRIVIA_BANK } from '@/data/daily-banks/trivia-bank'
import { WORD_GROUPING_BANK } from '@/data/daily-banks/word-grouping-bank'
import { CODENAMES_BANK } from '@/data/daily-banks/codenames-bank'

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

// --- Trivia banks (one per category, stored as TriviaQuestion objects) ---

/** Trivia parser bound to a category — stamps that category onto rows that don't specify one. */
function parseTrivia(category: TriviaCategory): (text: string) => PlatformContentParse {
  return (text) => {
    const r = parseTriviaQuestionImport(text, category)
    return { entries: r.questions, totalRows: r.totalRows, skippedRows: r.skippedRows, duplicateRows: r.duplicateRows }
  }
}

function triviaToText(entries: unknown[]): string {
  const rows = (entries as TriviaQuestion[]).map((q) => {
    const correct = ['a', 'b', 'c', 'd'][q.correctIndex] ?? 'a'
    const c = q.choices ?? []
    return [q.question, c[0] ?? '', c[1] ?? '', c[2] ?? '', c[3] ?? '', correct]
      .map((f) => csvField(String(f ?? '')))
      .join(',')
  })
  return ['question,option_a,option_b,option_c,option_d,correct', ...rows].join('\n')
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
  label: 'Punchline',
  columns: 'one prompt per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'prompt'),
  toText: (entries) => stringLinesToText(entries, 'prompt'),
  // Stored as plain strings (pickCustomQuiplashPrompts wraps them into {prompt} at draw time).
  builtins: [{ key: 'default', label: 'Punchline — Built-in', entries: QUIPLASH_PROMPTS.map((p) => p.prompt) }],
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

const QUICK_DRAW_GUESS_DEF: PlatformGameDef = {
  gameType: 'quick_draw',
  variant: 'guess',
  label: 'Quick Draw · Guess mode',
  columns: 'one word per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'word'),
  toText: (entries) => stringLinesToText(entries, 'word'),
  builtins: [{ key: 'default', label: 'Quick Draw Guess words — Built-in', entries: [...QUICK_DRAW_GUESS_WORD_POOL] }],
}

const CODEWORDS_DEF: PlatformGameDef = {
  gameType: 'codewords',
  label: 'Codewords',
  columns: 'one word per line',
  minEntries: CODEWORDS_MIN_CUSTOM_POOL, // a full board needs this many words
  parse: (text) => parseStringLines(text, 'word'),
  toText: (entries) => stringLinesToText(entries, 'word'),
  builtins: [
    { key: 'default', label: 'Codewords — Built-in', entries: CODEWORDS_WORD_POOL },
    {
      key: 'daily-bank',
      label: 'Codewords — Daily Challenge Bank (898 words)',
      entries: [...new Set(CODENAMES_BANK.flatMap((p) => p.grid))],
    },
  ],
}

const DESCRIBE_IT_DEF: PlatformGameDef = {
  gameType: 'describe_it',
  label: 'Text Charades',
  columns: 'one word per line',
  minEntries: 5,
  parse: (text) => parseStringLines(text, 'word'),
  toText: (entries) => stringLinesToText(entries, 'word'),
  builtins: [{ key: 'default', label: 'Text Charades — Built-in', entries: [...DESCRIBE_IT_WORD_POOL] }],
}

// Trivia: one variant per category. The game's trivia_category selects which bank to draw from.
// 'general' = all categories combined; 'tech' = legacy built-in; the rest are daily-bank sourced.
const TRIVIA_COLUMNS = 'question,option_a,option_b,option_c,option_d,correct'

const TRIVIA_CATEGORY_LABELS: Record<string, string> = {
  tech: 'Tech',
  general: 'General (All)',
  art: 'Art',
  food: 'Food',
  geography: 'Geography',
  history: 'History',
  language: 'Language',
  literature: 'Literature',
  math: 'Math',
  movies: 'Movies',
  music: 'Music',
  nature: 'Nature',
  pop_culture: 'Pop Culture',
  science: 'Science',
  sports: 'Sports',
  technology: 'Technology',
  world_culture: 'World Culture',
}

function dailyBankForCategory(cat: string): TriviaQuestion[] {
  return TRIVIA_BANK.filter((q) => q.category === cat).map((q) => ({
    question: q.question,
    choices: q.choices,
    correctIndex: q.correct_index,
    category: q.category as TriviaCategory,
  }))
}

const TRIVIA_TECH_DEF: PlatformGameDef = {
  gameType: 'trivia',
  variant: 'tech',
  label: 'Trivia · Tech',
  columns: TRIVIA_COLUMNS,
  minEntries: 5,
  parse: parseTrivia('tech'),
  toText: triviaToText,
  builtins: [
    { key: 'default', label: 'Trivia Tech — Built-in', entries: [...TRIVIA_TECH_QUESTIONS] },
    { key: 'daily-bank', label: 'Trivia Tech — Daily Bank', entries: dailyBankForCategory('technology') },
  ],
}

const TRIVIA_GENERAL_DEF: PlatformGameDef = {
  gameType: 'trivia',
  variant: 'general',
  label: 'Trivia · General (All)',
  columns: TRIVIA_COLUMNS,
  minEntries: 5,
  parse: parseTrivia('general'),
  toText: triviaToText,
  builtins: [
    { key: 'default', label: 'Trivia General — Built-in', entries: [...TRIVIA_GENERAL_QUESTIONS] },
    {
      key: 'daily-bank',
      label: 'Trivia — Daily Challenge Bank (1,395 questions)',
      entries: TRIVIA_BANK.map((q) => ({
        question: q.question,
        choices: q.choices,
        correctIndex: q.correct_index,
        category: q.category as TriviaCategory,
      })),
    },
  ],
}

const DAILY_TRIVIA_CATEGORIES = [
  'art',
  'food',
  'geography',
  'history',
  'language',
  'literature',
  'math',
  'movies',
  'music',
  'nature',
  'pop_culture',
  'science',
  'sports',
  'world_culture',
] as const

const TRIVIA_CATEGORY_DEFS: PlatformGameDef[] = DAILY_TRIVIA_CATEGORIES.map((cat) => ({
  gameType: 'trivia' as const,
  variant: cat,
  label: `Trivia · ${TRIVIA_CATEGORY_LABELS[cat] ?? cat}`,
  columns: TRIVIA_COLUMNS,
  minEntries: 5,
  parse: parseTrivia(cat as TriviaCategory),
  toText: triviaToText,
  builtins: [
    {
      key: 'daily-bank',
      label: `Trivia ${TRIVIA_CATEGORY_LABELS[cat]} — Daily Bank`,
      entries: dailyBankForCategory(cat),
    },
  ],
}))

// --- Word Grouping banks (stored as { groups: [{category, words, difficulty}] } objects) ---

function parseWordGrouping(text: string): PlatformContentParse {
  const entries: unknown[] = []
  let totalRows = 0
  let skippedRows = 0
  for (const line of text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    totalRows++
    try {
      const obj = JSON.parse(line)
      if (Array.isArray(obj?.groups) && obj.groups.length === 4) {
        entries.push(obj)
      } else {
        skippedRows++
      }
    } catch {
      skippedRows++
    }
  }
  return { entries, totalRows, skippedRows, duplicateRows: 0 }
}

function wordGroupingToText(entries: unknown[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n')
}

const WORD_GROUPING_DEF: PlatformGameDef = {
  gameType: 'word_grouping',
  label: 'Word Grouping',
  columns: 'JSON — one puzzle per line: {"groups":[{"category":"...","words":["a","b","c","d"],"difficulty":1},...]}',
  minEntries: 1,
  parse: parseWordGrouping,
  toText: wordGroupingToText,
  builtins: [
    {
      key: 'daily-bank',
      label: 'Word Grouping — Daily Challenge Bank (125 puzzles)',
      entries: [...WORD_GROUPING_BANK],
    },
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
  QUICK_DRAW_GUESS_DEF,
  CODEWORDS_DEF,
  DESCRIBE_IT_DEF,
  TRIVIA_TECH_DEF,
  TRIVIA_GENERAL_DEF,
  ...TRIVIA_CATEGORY_DEFS,
  WORD_GROUPING_DEF,
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
