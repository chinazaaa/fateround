import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags to prevent stored XSS. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '')
}

/** Strip Unicode bidi control characters that can mirror adjacent text in inline layouts. */
export function stripBidiControls(s: string): string {
  return s.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
}

/** Zod transform: trim + strip HTML. */
export const sanitizedString = (min: number, max: number) =>
  z
    .string()
    .transform((s) => stripHtml(s.trim()))
    .pipe(z.string().min(min, `Must be at least ${min} character(s)`).max(max, `Must be at most ${max} characters`))

/** Zod transform: trim + strip HTML + uppercase (for game codes). */
export const gameCodeString = () =>
  z
    .string()
    .transform((s) => stripHtml(s.trim()).toUpperCase())
    .pipe(
      z
        .string()
        .min(4, 'Game code must be 4-8 characters')
        .max(8, 'Game code must be 4-8 characters')
        .regex(/^[A-Z0-9]+$/, 'Game code must be alphanumeric')
    )

export const hostTokenString = () => z.string().min(1, 'hostToken is required')

export const uuidString = (label: string = 'ID') => z.string().uuid(`${label} must be a valid UUID`)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const gameTypeEnum = z.enum([
  'smash_marry_kill',
  'red_flag_green_flag',
  'smash_or_pass',
  'parent_approval',
  'would_you_rather',
  'never_have_i_ever',
  'pick_a_number',
  'this_or_that',
  'most_likely_to',
  'who_said_this',
  'hot_seat',
  'custom',
  'anonymous_messages',
  'secret_message',
  'bingo',
  'codewords',
  'trivia',
  'two_truths',
  'monopoly',
  'yahtzee',
  'whot',
  'crazy_eights',
  'ludo',
  'mahjong',
  'i_call_on',
  'sudoku',
  'tic_tac_toe',
  'word_hunt',
  'matching_pairs',
  'chess',
  'checkers',
  'ayo',
  'describe_it',
  'scrabble',
  'snake_and_ladder',
  'mafia',
  'quiplash',
  'word_rush',
  'quick_draw',
])

export const participantModeEnum = z.enum(['import', 'joiners', 'voters'])
export const autoSubmitBehaviorEnum = z.enum(['random', 'no_answer'])
export const pairVoteModeEnum = z.enum(['any', 'one_each'])
export const questionSourceEnum = z.enum(['platform', 'custom'])
export const triviaCategoryEnum = z.enum(['tech', 'general'])
export const playerQuestionsOrderEnum = z.enum(['players_first', 'uploaded_first', 'mixed'])
export const wstQuoteSourceEnum = z.enum(['player', 'anime', 'both'])
export const wyrChoiceEnum = z.enum(['a', 'b'])
export const participantGenderEnum = z.enum(['male', 'female'])
export const playerGenderEnum = z.enum(['male', 'female', 'both'])
export const pairFlagEnum = z.enum(['kiss', 'kill'])
export const themeEnum = z.enum(['default', 'neon', 'retro', 'elegant', 'tropical', 'pirate', 'arctic', 'naija'])
export const participantFilterEnum = z.enum(['all', 'joined'])
export const timerSecondsEnum = z.union([z.literal(10), z.literal(15), z.literal(30), z.literal(60)])

// ---------------------------------------------------------------------------
// Round timer options
// ---------------------------------------------------------------------------

export const ROUND_TIMER_OPTIONS = [15, 30, 60] as const
export type RoundTimerSeconds = (typeof ROUND_TIMER_OPTIONS)[number]

export function parseTimerSeconds(raw: unknown): RoundTimerSeconds {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  return ROUND_TIMER_OPTIONS.includes(n as RoundTimerSeconds) ? (n as RoundTimerSeconds) : 30
}

export { stripHtml }
