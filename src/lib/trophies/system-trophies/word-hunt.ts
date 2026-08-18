import type { SystemTrophySpec } from './types'

/**
 * Word Hunt — derived at finish from `word_hunt_submissions`. See `../game-facts/word-hunt.ts`.
 *
 * Each found word is persisted with path, points_awarded, and submitted_at. Points scale with
 * word length (3→100, 4→400, 5→800, 6+→800+(len-5)*400).
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Word Hunt Champion" → generic `games_won` Champion track.
 *
 * DROPPED:
 *  - #6 "Diagonal Finder" — path data is opaque jsonb indices; inferring diagonal from cell
 *    positions would need the grid dimensions which aren't in the submissions.
 *
 * 12 of the 15 briefed trophies are built.
 */
export const WORD_HUNT: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_word',
    tier: 'bronze',
    title: 'First word',
    description: 'Find your first word.',
    counter: 'word_hunt_words_found',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'four_letters',
    tier: 'bronze',
    title: 'Four letters',
    description: 'Find a four-letter word.',
    counter: 'word_hunt_four_letter_finds',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'five_letters',
    tier: 'bronze',
    title: 'Five letters',
    description: 'Find a five-letter word.',
    counter: 'word_hunt_five_letter_finds',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'ten_words',
    tier: 'bronze',
    title: 'Ten words',
    description: 'Find 10 words in one game.',
    counter: 'word_hunt_ten_words_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'thousand',
    tier: 'bronze',
    title: 'Thousand',
    description: 'Score 1,000 or more points in one game.',
    counter: 'word_hunt_thousand_games',
    points: 15,
    sortOrder: 50,
  },
  {
    suffix: 'fast_start',
    tier: 'bronze',
    title: 'Fast start',
    description: 'Find 3 words in the first 15 seconds.',
    counter: 'word_hunt_fast_start_games',
    points: 15,
    sortOrder: 60,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'six_letters',
    tier: 'silver',
    title: 'Six letters',
    description: 'Find a six-letter word.',
    counter: 'word_hunt_six_letter_finds',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'twenty_words',
    tier: 'silver',
    title: 'Twenty words',
    description: 'Find 20 words in one game.',
    counter: 'word_hunt_twenty_words_games',
    points: 25,
    sortOrder: 80,
  },
  {
    suffix: 'five_thousand',
    tier: 'silver',
    title: 'Five thousand',
    description: 'Score 5,000 or more points in one game.',
    counter: 'word_hunt_five_thousand_games',
    points: 30,
    sortOrder: 90,
  },
  {
    suffix: 'seven_plus',
    tier: 'silver',
    title: 'Seven plus',
    description: 'Find a word of 7 or more letters.',
    counter: 'word_hunt_seven_letter_finds',
    points: 30,
    sortOrder: 100,
  },
  {
    suffix: 'big_grid',
    tier: 'silver',
    title: 'Big grid',
    description: 'Play with 10 or more players.',
    counter: 'word_hunt_big_room_games',
    points: 25,
    sortOrder: 110,
  },
  {
    suffix: 'word_machine',
    tier: 'silver',
    title: 'Word machine',
    description: 'Find 30 words in one game.',
    counter: 'word_hunt_thirty_words_games',
    points: 35,
    sortOrder: 120,
  },
]
