/**
 * Shared Wordle Room types + pure helpers, used by BOTH the web (`src/lib/wordle-room.ts`
 * mirror) and the mobile app. Copies just the client-safe surface — grading, scoring,
 * standings, and the storage-shape parser. Server-only bits (Supabase queries, the atomic
 * record-guess flow, the reveal-hint RPC bridge) live only in the web app.
 */

export type WordleCategoryId =
  | 'general_english'
  | 'naija_slang'
  | 'sports'
  | 'food'
  | 'animals'
  | 'technology'
  | 'nature'
  | 'music'
  | 'science'
  | 'clothing'
  | 'travel'

export type WordleLetterState = 'correct' | 'present' | 'absent'

export type WordleRoomWordCount = 5 | 10 | 15 | 20

export const WORDLE_ROOM_WORD_COUNT_OPTIONS: readonly WordleRoomWordCount[] = [5, 10, 15, 20]
export const WORDLE_ROOM_DEFAULT_WORD_COUNT: WordleRoomWordCount = 5
export const WORDLE_ROOM_TIMER_OPTIONS: readonly number[] = [0, 120, 300, 600, 900]
export const WORDLE_ROOM_DEFAULT_TIMER = 0

export const WORDLE_ROOM_MIN_PLAYERS = 1
export const WORDLE_ROOM_MAX_PLAYERS = 20
export const WORDLE_ROOM_DEFAULT_MAX_PLAYERS = 20
export const WORDLE_ROOM_MIN_GUESS_INTERVAL_MS = 800
export const WORDLE_ROOM_HINT_COST = 300

/**
 * Sample CSV shown as a downloadable template under "Your own" for Wordle pools. The parser
 * (`parsePuzzleThemeCsv('wordle_room', csv)` on web) accepts `word,hint` per line — hint is
 * optional. Words must be 3–8 letters; the parser normalises to lowercase + strips non-a-z.
 */
export const WORDLE_ROOM_SAMPLE_CSV = [
  'word,hint',
  'apple,A common fruit',
  'happy,Feeling of joy',
  'chair,You sit on it',
  'music,Sounds arranged into songs',
  'river,Flowing water',
  'plant,Grows in soil',
  'ocean,Big salty water',
  'smile,Curved mouth of happiness',
  '',
].join('\n')

export interface WordleRoomMetadata {
  category: WordleCategoryId
  categoryLabel: string
  word_count: WordleRoomWordCount
  seed: number
}

export interface WordleRoomProgressRow {
  id: string
  game_id: string
  round_id: string
  player_id: string
  word_index: number
  current_word_guesses: number
  words_solved: number
  total_guesses: number
  total_points: number
  total_time_ms: number | null
  finished: boolean
  finished_at: string | null
  created_at: string
  updated_at: string
  hints_used?: number[]
}

export interface WordleRoomStandingRow {
  player_id: string
  name: string
  word_index: number
  words_solved: number
  total_guesses: number
  total_time_ms: number | null
  finished: boolean
  total_points: number
  hints_used_count: number
}

// ── Normalization + attempts ─────────────────────────────────────────────────

export function normalizeWordleWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

/** Attempts scale with word length: 5 letters → 6 attempts, 3 letters → 4, etc. */
export function wordleMaxAttempts(wordLength: number): number {
  return wordLength + 1
}

export function wordleRoomMaxAttemptsForWord(word: string): number {
  return wordleMaxAttempts(normalizeWordleWord(word).length)
}

// ── Letter grading — standard Wordle duplicate-letter rules ──────────────────

export function gradeWordleGuess(guess: string, target: string): WordleLetterState[] {
  const g = normalizeWordleWord(guess)
  const t = normalizeWordleWord(target)
  const length = t.length
  const states: WordleLetterState[] = new Array(length).fill('absent')
  if (g.length !== length) return states

  const remaining = new Map<string, number>()
  for (const ch of t) remaining.set(ch, (remaining.get(ch) ?? 0) + 1)

  for (let i = 0; i < length; i++) {
    if (g[i] === t[i]) {
      states[i] = 'correct'
      remaining.set(g[i]!, (remaining.get(g[i]!) ?? 0) - 1)
    }
  }
  for (let i = 0; i < length; i++) {
    if (states[i] === 'correct') continue
    const ch = g[i]!
    const left = remaining.get(ch) ?? 0
    if (left > 0) {
      states[i] = 'present'
      remaining.set(ch, left - 1)
    }
  }
  return states
}

// ── Scoring ──────────────────────────────────────────────────────────────────

export function wordleBasePoints(guessesUsed: number, maxAttempts: number): number {
  const attempts = Math.max(2, maxAttempts)
  const used = Math.max(1, Math.min(guessesUsed, attempts))
  return Math.round(1000 - (used - 1) * (600 / (attempts - 1)))
}

export function wordleRoomWordScore(
  guessesUsed: number,
  maxAttempts: number,
  won: boolean,
  hintUsed: boolean = false
): number {
  if (!won) return 0
  const base = wordleBasePoints(guessesUsed, maxAttempts)
  const perfect = guessesUsed === 1 ? 200 : 0
  const hintCost = hintUsed ? WORDLE_ROOM_HINT_COST : 0
  return Math.max(0, base + perfect - hintCost)
}

// ── Standings ────────────────────────────────────────────────────────────────

export interface WordleRoomStandingInput {
  player_id: string
  words_solved: number
  total_guesses: number
  total_time_ms: number | null
  finished: boolean
  total_points?: number
}

export function rankWordleRoomStandings<T extends WordleRoomStandingInput>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (b.total_points ?? 0) - (a.total_points ?? 0) ||
      (a.finished ? (a.total_time_ms ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER) -
        (b.finished ? (b.total_time_ms ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER)
  )
}

export function tallyWordleRoomScores(
  progress: ReadonlyArray<
    Pick<
      WordleRoomProgressRow,
      'player_id' | 'word_index' | 'words_solved' | 'total_guesses' | 'total_time_ms' | 'finished'
    > & { total_points?: number | null; hints_used?: unknown }
  >,
  players: { id: string; name: string; spectator?: boolean | null }[]
): WordleRoomStandingRow[] {
  const active = players.filter((p) => p.spectator !== true)
  const byPlayer = new Map(progress.map((p) => [p.player_id, p]))
  return rankWordleRoomStandings(
    active.map((p) => {
      const row = byPlayer.get(p.id)
      const hintsCount = Array.isArray(row?.hints_used) ? (row!.hints_used as unknown[]).length : 0
      return {
        player_id: p.id,
        name: p.name,
        word_index: row?.word_index ?? 0,
        words_solved: row?.words_solved ?? 0,
        total_guesses: row?.total_guesses ?? 0,
        total_time_ms: row?.total_time_ms ?? null,
        finished: row?.finished ?? false,
        total_points: row?.total_points ?? 0,
        hints_used_count: hintsCount,
      }
    })
  )
}

// ── Category / clamp helpers ─────────────────────────────────────────────────

const VALID_CATEGORY_IDS: readonly WordleCategoryId[] = [
  'general_english',
  'naija_slang',
  'sports',
  'food',
  'animals',
  'technology',
  'nature',
  'music',
  'science',
  'clothing',
  'travel',
]

export const WORDLE_ROOM_CATEGORY_LABELS: Record<WordleCategoryId, string> = {
  general_english: 'General English',
  naija_slang: 'Naija Slang',
  sports: 'Sports',
  food: 'Food & Drink',
  animals: 'Animals',
  technology: 'Technology',
  nature: 'Nature',
  music: 'Music',
  science: 'Science',
  clothing: 'Clothing & Fashion',
  travel: 'Travel & Places',
}

export function clampWordleRoomCategory(raw: unknown): WordleCategoryId {
  return typeof raw === 'string' && (VALID_CATEGORY_IDS as readonly string[]).includes(raw)
    ? (raw as WordleCategoryId)
    : 'general_english'
}

export function clampWordleRoomWordCount(raw: unknown): WordleRoomWordCount {
  const n = Number(raw)
  return (WORDLE_ROOM_WORD_COUNT_OPTIONS as readonly number[]).includes(n)
    ? (n as WordleRoomWordCount)
    : WORDLE_ROOM_DEFAULT_WORD_COUNT
}

export function parseWordleRoomMetadata(raw: unknown): WordleRoomMetadata | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const category = clampWordleRoomCategory(rec.category)
  const word_count = clampWordleRoomWordCount(rec.word_count)
  const seed = typeof rec.seed === 'number' ? rec.seed : 0
  const categoryLabel =
    typeof rec.categoryLabel === 'string' ? rec.categoryLabel : WORDLE_ROOM_CATEGORY_LABELS[category]
  return { category, categoryLabel, word_count, seed }
}
