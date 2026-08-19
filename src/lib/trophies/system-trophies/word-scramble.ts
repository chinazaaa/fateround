import type { SystemTrophySpec } from './types'

/**
 * Word Scramble — derived at finish from `word_scramble_solves` + `word_scramble_hints`. See
 * `../game-facts/word-scramble.ts`.
 *
 * Each solved scramble is persisted with word, `via_hint`, and `solved_at`. We can derive solve
 * counts, streaks (consecutive solves without wrong), speed, and completion.
 *
 * OMITTED (covered by generic catalog):
 *  - #8 "Winner" → generic `games_won`.
 *  - #15 "Word Scramble Champion" → generic `games_won` Champion track.
 *
 * DROPPED:
 *  - #6 "Quick Fingers" (under 3s per solve) — individual solve timing not reliably derivable
 *    from `solved_at` alone (no per-scramble start time).
 *  - #9 "Speed Demon" (average under 5s) — same timing issue.
 *  - #13 "Comeback" — no halfway scoring persisted.
 *
 * 10 of the 15 briefed trophies are built.
 */
export const WORD_SCRAMBLE: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'first_unscramble',
    tier: 'bronze',
    title: 'First unscramble',
    description: 'Solve your first scramble.',
    counter: 'word_scramble_solves_total',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'five_solved',
    tier: 'bronze',
    title: 'Five solved',
    description: 'Solve 5 scrambles in one game.',
    counter: 'word_scramble_five_solved_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'long_word',
    tier: 'bronze',
    title: 'Long word',
    description: 'Unscramble a word of 7 or more letters.',
    counter: 'word_scramble_long_word_solves',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'ten_solved',
    tier: 'bronze',
    title: 'Ten solved',
    description: 'Solve 10 scrambles in one game.',
    counter: 'word_scramble_ten_solved_games',
    points: 15,
    sortOrder: 40,
  },
  {
    suffix: 'themed',
    tier: 'bronze',
    title: 'Themed',
    description: 'Play a themed word scramble.',
    counter: 'word_scramble_themed_games',
    points: 10,
    sortOrder: 50,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'longest_word',
    tier: 'silver',
    title: 'Longest word',
    description: 'Unscramble a word of 10 or more letters.',
    counter: 'word_scramble_very_long_word_solves',
    points: 25,
    sortOrder: 60,
  },
  {
    suffix: 'big_race',
    tier: 'silver',
    title: 'Big race',
    description: 'Play with 10 or more players.',
    counter: 'word_scramble_big_room_games',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'flawless',
    tier: 'silver',
    title: 'Flawless',
    description: 'Finish a game solving every scramble without using any hints.',
    counter: 'word_scramble_flawless_games',
    points: 30,
    sortOrder: 80,
  },
  {
    suffix: 'complete',
    tier: 'silver',
    title: 'Complete',
    description: 'Solve every scramble in the puzzle.',
    counter: 'word_scramble_complete_games',
    points: 25,
    sortOrder: 90,
  },
  {
    suffix: 'no_hints',
    tier: 'silver',
    title: 'No hints',
    description: 'Complete a puzzle without using any hints.',
    counter: 'word_scramble_no_hint_completions',
    points: 30,
    sortOrder: 100,
  },
]
