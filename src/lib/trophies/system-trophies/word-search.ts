import type { SystemTrophySpec } from './types'

/**
 * Word Search — derived at finish from `word_search_found`. See `../game-facts/word-search.ts`.
 *
 * Each found word is persisted with position (start/end row/col), `via_hint`, and `found_at`.
 * We can derive word count, direction, hint usage, completion, and speed.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Word Search Champion" → generic `games_won` Champion track.
 *
 * DROPPED:
 *  - #13 "Comeback" — no halfway scoring persisted.
 *
 * 12 of the 15 briefed trophies are built.
 */
export const WORD_SEARCH: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_find',
    tier: 'bronze',
    title: 'First find',
    description: 'Find your first word.',
    counter: 'word_search_words_found',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'five_found',
    tier: 'bronze',
    title: 'Five found',
    description: 'Find 5 words in one game.',
    counter: 'word_search_five_found_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'diagonal_eye',
    tier: 'bronze',
    title: 'Diagonal eye',
    description: 'Find a word placed diagonally.',
    counter: 'word_search_diagonal_finds',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'backwards',
    tier: 'bronze',
    title: 'Backwards',
    description: 'Find a word placed in reverse.',
    counter: 'word_search_reverse_finds',
    points: 10,
    sortOrder: 40,
  },
  {
    suffix: 'ten_found',
    tier: 'bronze',
    title: 'Ten found',
    description: 'Find 10 words in one game.',
    counter: 'word_search_ten_found_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'themed',
    tier: 'bronze',
    title: 'Themed',
    description: 'Play a themed word search puzzle.',
    counter: 'word_search_themed_games',
    points: 10,
    sortOrder: 60,
  },
  {
    suffix: 'fast_start',
    tier: 'bronze',
    title: 'Fast start',
    description: 'Find 3 words in the first 20 seconds.',
    counter: 'word_search_fast_start_games',
    points: 15,
    sortOrder: 70,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'full_grid',
    tier: 'silver',
    title: 'Full grid',
    description: 'Find every word in a puzzle.',
    counter: 'word_search_full_grid_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'long_word',
    tier: 'silver',
    title: 'Long word',
    description: 'Find a word of 8 or more letters.',
    counter: 'word_search_long_word_finds',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'big_race',
    tier: 'silver',
    title: 'Big race',
    description: 'Play with 10 or more players.',
    counter: 'word_search_big_room_games',
    points: 25,
    sortOrder: 100,
  },
  {
    suffix: 'eagle_eye',
    tier: 'silver',
    title: 'Eagle eye',
    description: 'Find every word without using any hints.',
    counter: 'word_search_no_hint_completions',
    points: 30,
    sortOrder: 110,
  },
  {
    suffix: 'no_hints',
    tier: 'silver',
    title: 'No hints',
    description: 'Complete a puzzle without hints.',
    counter: 'word_search_no_hint_completions',
    points: 30,
    sortOrder: 120,
  },
]
