import type { QuestionPackGameType } from '@/lib/question-pack-game-types'

/**
 * One-line preview of a single `question_packs.questions` item, for the admin review list.
 *
 * This runs on *unapproved, user-submitted* JSON: `POST /api/library`
 * (src/app/api/library/route.ts:154) only checks `Array.isArray(questions)` and inserts the
 * array verbatim, so an item can be any JSON value at all. A previewer that throws takes the
 * whole review page down and leaves the pack unreviewable, so every branch below reads fields
 * defensively and never interpolates an unknown value into a template literal.
 *
 * It lives here rather than in src/app/admin/library/page.tsx so it can be unit-tested without
 * rendering the page (the page is a client component that constructs a Supabase client).
 */

/**
 * A field read off an untrusted item. Strings pass through; numbers and booleans are stringified
 * because a CSV import can land either; everything else (objects, arrays, symbols, null,
 * undefined, functions) renders empty rather than as `[object Object]` — and, critically, cannot
 * throw the way `String(x)` does on a symbol or on an object with a throwing `toString`.
 */
function field(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

/**
 * Reads one property off an untrusted value. In practice these items arrive from `res.json()`,
 * so they are plain JSON and a bare `q.foo` would do — but the whole point of this module is that
 * nothing about the item is guaranteed, and a getter that throws would take the review page down
 * with it. Used by the new branches only; the six pre-existing ones are left byte-identical.
 */
function read(o: unknown, key: string): unknown {
  if (!o || typeof o !== 'object') return undefined
  try {
    return (o as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/**
 * First non-empty rendering among `keys`, or null if none of them holds a usable scalar. An
 * empty string counts as absent everywhere, so `{ prompt: '', question: 'a cat' }` previews the
 * question rather than a blank line.
 */
function firstField(q: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const v = field(read(q, key))
    if (v !== '') return v
  }
  return null
}

/**
 * `null` means "nothing usable in this item" and sends the caller to the raw-JSON fallback.
 * Returning '' instead would print a preview line reading just "3. " — strictly less than the
 * JSON this function replaced, on the one screen where an admin has to see what they are
 * approving. Only the new branches can return null; the six pre-existing ones always return the
 * string they always returned, '' included.
 */
type QuestionPreviewer = (q: Record<string, unknown>) => string | null

/**
 * Most Likely To / Never Have I Ever / Pick a Number.
 *
 * The submit page stores these as bare strings — `validatePrompts` pushes `v` directly
 * (src/app/library/submit/page.tsx:164, dispatched at :560-561) — and a bare string never
 * reaches this map. The object form exists because the stored-pool parser accepts it:
 * `parseStoredMltQuestions` reads `item.question` when the item is an object
 * (src/lib/custom-questions.ts:834-841). Matches the `trivia` branch's field choice.
 */
const promptQuestion: QuestionPreviewer = (q) => firstField(q, ['question'])

const PREVIEWERS = {
  // --- Unchanged from the original in src/app/admin/library/page.tsx. Output must stay
  // byte-identical, including where it renders "undefined" for a missing field. ---
  trivia: (q) => String(q.question ?? ''),
  would_you_rather: (q) => `${q.optionA} or ${q.optionB}`,
  this_or_that: (q) => `${q.optionA} or ${q.optionB}`,
  crossword: (q) => `${q.answer ?? ''} — ${q.clue ?? ''}`,
  word_search: (q) => String(q.word ?? ''),
  word_scramble: (q) => (q.hint ? `${q.word} — ${q.hint}` : String(q.word ?? '')),

  // --- New: the eight that previously fell through to JSON.stringify. ---
  most_likely_to: promptQuestion,
  never_have_i_ever: promptQuestion,
  pick_a_number: promptQuestion,

  /**
   * Describe It stores bare strings — `validateDescribeIt` feeds the CSV's `word` column through
   * `parseDescribeItWords`, which returns `string[]` (src/app/library/submit/page.tsx:171-179,
   * dispatched at :554). `parseStoredDescribeItWords` skips any non-string item
   * (src/lib/describe-it-words.ts:284), so an object item is already malformed; `word` is read
   * because that is the column the submitted CSV carries.
   */
  describe_it: (q) => firstField(q, ['word']),

  /**
   * Quick Draw shares Describe It's validator, so submitted packs are bare strings too
   * (src/app/library/submit/page.tsx:554). `question` comes first because that is the field the
   * only object-reading consumer actually plays: quick_draw is dispatched to
   * `parseStoredMltQuestions` (src/lib/custom-questions.ts:854), which reads `item.question`
   * (:839). `prompt` follows it (the built-in pool's `QuickDrawPrompt { prompt: string }`,
   * src/lib/quick-draw-prompts.ts:5-7 — a different shape from a pack item, but a plausible
   * hand-edit), then `word`, the column the submitted CSV carries.
   */
  quick_draw: (q) => firstField(q, ['question', 'prompt', 'word']),

  /**
   * Codewords stores bare single words — `validateCodewords` runs the CSV's `word` column
   * through `parseCodewordsWordRows`, which returns `string[]`
   * (src/app/library/submit/page.tsx:181-190, dispatched at :555).
   * `parseStoredCodewordsWords` skips non-strings (src/lib/codewords-pool.ts:86).
   */
  codewords: (q) => firstField(q, ['word']),

  /**
   * One Word Grouping item is a whole *puzzle*: `{ groups: { category, words, difficulty }[] }`
   * — built at src/app/library/submit/page.tsx:308-315, typed at src/lib/word-grouping.ts:70 and
   * packages/shared/src/word-grouping.ts:43-47. The four category names are what the submit
   * page's own preview shows for this type (src/app/library/submit/page.tsx:905-910), joined
   * with the same ' · ' separator, so an admin sees the same line the submitter did.
   */
  word_grouping: (q) => {
    const groups = read(q, 'groups')
    if (!Array.isArray(groups)) return null
    const categories = groups.map((g) => field(read(g, 'category'))).filter((c) => c !== '')
    return categories.length > 0 ? categories.join(' · ') : null
  },

  /**
   * Who Said This stores `WstDeckEntry { quote, options: string[], correctIndex: number }`
   * — built at src/app/library/submit/page.tsx:119-123 (dispatched at :552), typed at
   * src/lib/who-said-this.ts:148-152. The attributed speaker is the half a moderator has to
   * check, so it is appended with the same ' — ' separator the crossword branch uses; the index
   * is fully range-checked, and a quote with an unresolvable answer still previews on its own.
   */
  who_said_this: (q) => {
    const quote = field(read(q, 'quote'))
    const options = read(q, 'options')
    const i = read(q, 'correctIndex')
    if (Array.isArray(options) && typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < options.length) {
      const answer = field(read(options, String(i)))
      if (answer) return quote ? `${quote} — ${answer}` : answer
    }
    return quote === '' ? null : quote
  },
  // `satisfies Record<QuestionPackGameType, …>` is the point of this map: the union is derived
  // from QUESTION_PACK_GAME_TYPES, which is pinned set-equal to the question_packs_game_type_check
  // constraint, so a new accepted game_type that nobody adds a preview for is a *compile* error,
  // and a key that is not an accepted game_type is one too (excess-property check). This area has
  // drifted by omission repeatedly; that is the drift this closes.
} satisfies Record<QuestionPackGameType, QuestionPreviewer>

/** Exported for the pin test, which asserts set equality against the accepted list both ways. */
export const PREVIEWED_GAME_TYPES = Object.keys(PREVIEWERS) as readonly QuestionPackGameType[]

export function previewText(gameType: string, q: unknown): string {
  if (typeof q === 'string') return q
  if (!q || typeof q !== 'object') return String(q)
  const obj = q as Record<string, unknown>
  // hasOwnProperty, not `gameType in PREVIEWERS`: `game_type` comes off the wire, and a value
  // like "constructor" or "toString" would otherwise hit Object.prototype and be "callable".
  if (Object.prototype.hasOwnProperty.call(PREVIEWERS, gameType)) {
    const preview = PREVIEWERS[gameType as QuestionPackGameType](obj)
    if (preview !== null) return preview
  }
  // Reached for anything unrecognised — a game_type the DB constraint has grown that this build
  // predates — and for a known type whose item holds nothing renderable. Showing the raw JSON is
  // how origin/dev behaved for both, and on a moderation screen it beats showing nothing.
  return JSON.stringify(q)
}
