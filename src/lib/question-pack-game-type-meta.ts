import { QUESTION_PACK_GAME_TYPES, type QuestionPackGameType } from '@/lib/question-pack-game-types'

export interface QuestionPackGameTypeMeta {
  /** Human label for the type. Shown on pack badges, the admin picker and the public filter. */
  label: string
  /** Tailwind classes for the badge pill: text + dark text + tint + border, in that order. */
  color: string
}

/**
 * Presentation for every `question_packs.game_type` value.
 *
 * `satisfies Record<QuestionPackGameType, …>` is the point of this module: a value the DB accepts
 * but that has no entry here is a **compile error**, not a badge silently rendering the raw slug
 * (`{meta?.label ?? gt}`), and a key that is not a real game type is a compile error too. Adding a
 * type to `QUESTION_PACK_GAME_TYPES` therefore cannot be finished without giving it a label.
 *
 * **Declaration order is the UI order.** `QUESTION_PACK_GAME_TYPE_ORDER` below is
 * `Object.keys()` of this object, so the picker and the filter dropdown read in the order written
 * here. It intentionally keeps the order the public library and submit pickers already showed
 * (Who Said This second) rather than the order of `QUESTION_PACK_GAME_TYPES`, which is the
 * chronological order of the CHECK-constraint migrations and means nothing to a player.
 */
export const QUESTION_PACK_GAME_TYPE_META = {
  trivia: { label: 'Trivia', color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/25' },
  who_said_this: {
    label: 'Who Said This',
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/25',
  },
  would_you_rather: {
    label: 'Would You Rather',
    color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/25',
  },
  most_likely_to: {
    label: 'Most Likely To',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
  },
  this_or_that: {
    label: 'This or That',
    color: 'text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/25',
  },
  never_have_i_ever: {
    label: 'Never Have I Ever',
    color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25',
  },
  describe_it: {
    label: 'Text Charades',
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
  },
  quick_draw: {
    label: 'Quick Draw',
    color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/25',
  },
  codewords: {
    label: 'Codewords',
    color: 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25',
  },
  pick_a_number: {
    label: 'Pick a Number',
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
  },
  crossword: {
    label: 'Crossword',
    color: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
  },
  word_search: {
    label: 'Word Search',
    color: 'text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25',
  },
  word_scramble: {
    label: 'Word Scramble',
    color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25',
  },
  // Label matches the canonical one in `GAME_TYPE_CONFIG.word_grouping` / `DAILY_GAME_LABELS`;
  // orange follows that config's card accent (#f97316) and is the one hue no other pack type uses.
  word_grouping: {
    label: 'Word Grouping',
    color: 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/25',
  },
} as const satisfies Record<QuestionPackGameType, QuestionPackGameTypeMeta>

/**
 * Every pack game type, in the order the pickers should show them.
 *
 * Derived from `QUESTION_PACK_GAME_TYPE_META`'s keys rather than written out again: the meta is
 * exhaustive against the constraint by type, and ES key order for non-numeric keys is insertion
 * order, so this array is exhaustive by construction and cannot drift from either.
 */
export const QUESTION_PACK_GAME_TYPE_ORDER = Object.keys(QUESTION_PACK_GAME_TYPE_META) as QuestionPackGameType[]

/**
 * Meta for a `game_type` that arrived as a plain string (an API response, a DB row). Returns
 * `undefined` for anything not in the constraint so callers keep their `?? gameType` fallback —
 * the type system cannot vouch for a value that came off the wire.
 */
export function questionPackGameTypeMeta(gameType: string): QuestionPackGameTypeMeta | undefined {
  // `Object.hasOwn` guard, not a bare index: the argument comes off the wire, and a plain lookup
  // answers `'toString'` and `'constructor'` with an inherited `Function`, which would render as
  // a badge label of raw source text.
  if (!Object.hasOwn(QUESTION_PACK_GAME_TYPE_META, gameType)) return undefined
  return (QUESTION_PACK_GAME_TYPE_META as Record<string, QuestionPackGameTypeMeta>)[gameType]
}

/** `QUESTION_PACK_GAME_TYPES` re-exported so a consumer needs only this module. */
export { QUESTION_PACK_GAME_TYPES, type QuestionPackGameType }
